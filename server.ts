import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import {
  normalizeRawCompany,
  onlyDigits,
  formatCnpj,
  type AdvancedSearchFilters,
  type CompanyRecord,
} from './src/shared/cnpj.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_CDD_SEARCH_URL = 'https://api.casadosdados.com.br/v5/cnpj/pesquisa';
const DEFAULT_CDD_DETAIL_URL = 'https://api.casadosdados.com.br/v4/cnpj';

// In-memory caches for official IBGE reference data
const municipiosCache = new Map<string, Array<{ id: number; nome: string; uf: string }>>();
let cnaesCache: Array<{ codigo: string; descricao: string }> | null = null;

async function fetchJsonWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'ExtratorCNPJ/1.0',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function buildCasaDosDadosPayload(filters: AdvancedSearchFilters) {
  const payload: Record<string, unknown> = {
    limite: Math.min(Math.max(filters.limite || 20, 1), 100),
    pagina: Math.max(filters.pagina || 1, 1),
  };

  const termo = filters.termo?.trim();
  if (termo) {
    payload.busca_textual = [
      {
        texto: [termo],
        tipo_busca: 'radical',
        razao_social: true,
        nome_fantasia: true,
      },
    ];
  }

  const cnaeVal = (filters.cnaeCodigo || filters.cnae || '').trim();
  if (cnaeVal) {
    const codes = cnaeVal
      .split(/[,;]+/)
      .map((s) => onlyDigits(s))
      .filter((s) => s.length >= 4);
    if (codes.length > 0) {
      payload.codigo_atividade_principal = codes;
    }
  }

  if (filters.incluirAtividadeSecundaria) {
    payload.incluir_atividade_secundaria = true;
  }

  const natVal = (filters.naturezaCodigo || filters.naturezaJuridica || '').trim();
  if (natVal) {
    const codes = natVal
      .split(/[,;]+/)
      .map((s) => onlyDigits(s))
      .filter((s) => s.length >= 3);
    if (codes.length > 0) {
      payload.codigo_natureza_juridica = codes;
    }
  }

  if (filters.situacaoCadastral && filters.situacaoCadastral.length > 0) {
    payload.situacao_cadastral = filters.situacaoCadastral;
  }

  if (filters.ufs && filters.ufs.length > 0) {
    payload.uf = filters.ufs.map((u) => u.toUpperCase());
  }

  if (filters.municipios && filters.municipios.length > 0) {
    // Strip trailing " - UF" if present for Casa dos Dados v5 municipio array
    payload.municipio = filters.municipios.map((m) =>
      m.replace(/\s*-\s*[A-Z]{2}$/i, '').trim().toUpperCase()
    );
  }

  if (filters.bairros && filters.bairros.length > 0) {
    payload.bairro = filters.bairros.map((b) => b.trim().toUpperCase()).filter(Boolean);
  }

  const cepDigits = onlyDigits(filters.cep || '');
  if (cepDigits.length === 8) {
    payload.cep = [cepDigits];
  }

  const dddDigits = onlyDigits(filters.ddd || '');
  if (dddDigits.length === 2) {
    payload.ddd = [dddDigits];
  }

  if (filters.dataAberturaInicio || filters.dataAberturaFim) {
    const dateRange: Record<string, string> = {};
    if (filters.dataAberturaInicio) dateRange.inicio = filters.dataAberturaInicio;
    if (filters.dataAberturaFim) dateRange.fim = filters.dataAberturaFim;
    payload.data_abertura = dateRange;
  }

  const capMin = onlyDigits(filters.capitalSocialMin || '');
  const capMax = onlyDigits(filters.capitalSocialMax || '');
  if (capMin || capMax) {
    const cap: Record<string, number> = {};
    if (capMin) cap.minimo = Number(capMin);
    if (capMax) cap.maximo = Number(capMax);
    payload.capital_social = cap;
  }

  if (filters.somenteMei || filters.excluirMei) {
    payload.mei = {
      optante: filters.somenteMei,
      excluir_optante: filters.excluirMei,
    };
  }

  if (filters.somenteMatriz && !filters.somenteFilial) {
    payload.matriz_filial = 'MATRIZ';
  } else if (filters.somenteFilial && !filters.somenteMatriz) {
    payload.matriz_filial = 'FILIAL';
  }

  const maisFiltros: Record<string, boolean> = {};
  if (filters.comTelefone) maisFiltros.com_telefone = true;
  if (filters.somenteFixo) maisFiltros.somente_fixo = true;
  if (filters.somenteCelular) maisFiltros.somente_celular = true;
  if (filters.comEmail) maisFiltros.com_email = true;
  if (Object.keys(maisFiltros).length > 0) {
    payload.mais_filtros = maisFiltros;
  }

  return payload;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const FREE_QUEUE_DELAY_MS = 450;

// Round-robin cursor alternating primary requests between MinhaReceita and BrasilAPI
let roundRobinCursor = 0;

// In-memory inbox queue for companies pushed from the browser Bookmarklet / Console Script
let pendingBookmarkletRecords: CompanyRecord[] = [];

interface FreeProvider {
  name: 'MinhaReceita' | 'BrasilAPI' | 'OpenCNPJ' | 'CNPJ.ws';
  url: (cleanCnpj: string) => string;
}

const PRIMARY_FREE_PROVIDERS: FreeProvider[] = [
  { name: 'MinhaReceita', url: (c) => `https://minhareceita.org/${c}` },
  { name: 'BrasilAPI', url: (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}` },
];

const EXTRA_FALLBACK_PROVIDERS: FreeProvider[] = [
  { name: 'OpenCNPJ', url: (c) => `https://api.opencnpj.org/${c}` },
  { name: 'CNPJ.ws', url: (c) => `https://publica.cnpj.ws/cnpj/${c}` },
];

async function lookupSingleCnpj(
  cnpjDigits: string,
  apiKey?: string
): Promise<{ record: CompanyRecord; provider: string }> {
  const clean = onlyDigits(cnpjDigits);
  if (clean.length !== 14) {
    throw new Error(`CNPJ inválido: ${cnpjDigits}`);
  }

  // 1. Try Casa dos Dados v4 detail if API key is provided
  if (apiKey) {
    try {
      const res = await fetchJsonWithTimeout(`${DEFAULT_CDD_DETAIL_URL}/${clean}`, {
        headers: {
          'api-key': apiKey,
          Accept: 'application/json',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        if (data && (data.cnpj || data.razao_social)) {
          return { record: normalizeRawCompany(data), provider: 'CasaDosDados' };
        }
      }
    } catch {
      // Fallback to free public Receita Federal rotation
    }
  }

  // 2. Round-robin rotation between MinhaReceita and BrasilAPI (with automatic fallback)
  const startIdx = roundRobinCursor % PRIMARY_FREE_PROVIDERS.length;
  roundRobinCursor = (roundRobinCursor + 1) % 1000000;

  const rotatedProviders: FreeProvider[] = [
    PRIMARY_FREE_PROVIDERS[startIdx],
    PRIMARY_FREE_PROVIDERS[(startIdx + 1) % PRIMARY_FREE_PROVIDERS.length],
    ...EXTRA_FALLBACK_PROVIDERS,
  ];

  let lastStatus = 0;
  for (const provider of rotatedProviders) {
    try {
      const res = await fetchJsonWithTimeout(provider.url(clean), {
        headers: { Accept: 'application/json' },
      });
      lastStatus = res.status;
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const normalized = normalizeRawCompany(data);
        if (normalized.cnpj && normalized.razaoSocial) {
          return { record: normalized, provider: provider.name };
        }
      }
    } catch {
      // On timeout, network error, or 429 rate-limit, immediately fall back to next provider
    }
  }

  throw new Error(
    lastStatus === 404
      ? `CNPJ ${formatCnpj(clean)} não encontrado na Receita Federal.`
      : `Não foi possível consultar ${formatCnpj(clean)} nas APIs públicas (HTTP ${lastStatus || 'rede'}).`
  );
}

async function processCnpjQueue(cnpjs: string[], apiKey?: string) {
  const uniqueCnpjs = Array.from(
    new Set(cnpjs.map((c) => onlyDigits(String(c))).filter((c) => c.length === 14))
  );

  const results: CompanyRecord[] = [];
  const errors: Array<{ cnpj: string; error: string }> = [];
  const providersUsed: Record<string, number> = {};

  for (let i = 0; i < uniqueCnpjs.length; i++) {
    const cnpj = uniqueCnpjs[i];
    try {
      const { record, provider } = await lookupSingleCnpj(cnpj, apiKey);
      results.push(record);
      providersUsed[provider] = (providersUsed[provider] || 0) + 1;
    } catch (err) {
      errors.push({
        cnpj: formatCnpj(cnpj),
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }

    // Strict 450ms interval between queue calls to avoid rate limiting
    if (i < uniqueCnpjs.length - 1) {
      await sleep(FREE_QUEUE_DELAY_MS);
    }
  }

  return { results, errors, providersUsed };
}

function mergeCompanyRecords(primary: CompanyRecord, secondary: CompanyRecord): CompanyRecord {
  return {
    cnpj: primary.cnpj || secondary.cnpj,
    razaoSocial: primary.razaoSocial || secondary.razaoSocial,
    situacaoCadastral: primary.situacaoCadastral || secondary.situacaoCadastral,
    dataSituacao: primary.dataSituacao || secondary.dataSituacao,
    municipio: primary.municipio || secondary.municipio,
    estado: primary.estado || secondary.estado,
    email: primary.email || secondary.email,
    telefone: primary.telefone || secondary.telefone,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // IBGE Municipalities by UF
  app.get('/api/ibge/municipios/:uf', async (req: Request, res: Response) => {
    const uf = String(req.params.uf || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (uf.length !== 2) {
      res.status(400).json({ error: 'UF inválida' });
      return;
    }

    if (municipiosCache.has(uf)) {
      res.json(municipiosCache.get(uf));
      return;
    }

    try {
      const ibgeRes = await fetchJsonWithTimeout(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`
      );
      if (!ibgeRes.ok) {
        res.status(502).json({ error: 'Falha ao buscar municípios no IBGE' });
        return;
      }
      const raw = (await ibgeRes.json()) as Array<{ id: number; nome: string }>;
      const list = raw.map((m) => ({
        id: m.id,
        nome: m.nome.toUpperCase(),
        uf,
      }));
      municipiosCache.set(uf, list);
      res.json(list);
    } catch {
      res.status(502).json({ error: 'Não foi possível conectar à API do IBGE' });
    }
  });

  // IBGE CNAEs search
  app.get('/api/ibge/cnaes', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim().toLowerCase();

    try {
      if (!cnaesCache) {
        const ibgeRes = await fetchJsonWithTimeout(
          'https://servicodados.ibge.gov.br/api/v2/cnae/subclasses'
        );
        if (ibgeRes.ok) {
          const raw = (await ibgeRes.json()) as Array<{ id: string; descricao: string }>;
          const seen = new Set<string>();
          cnaesCache = [];
          for (const item of raw) {
            const code = onlyDigits(item.id);
            if (code && !seen.has(code)) {
              seen.add(code);
              cnaesCache.push({ codigo: code, descricao: item.descricao });
            }
          }
        }
      }

      if (!cnaesCache) {
        res.json([]);
        return;
      }

      if (!q) {
        res.json(cnaesCache.slice(0, 30));
        return;
      }

      const qDigits = onlyDigits(q);
      const filtered = cnaesCache
        .filter((item) => {
          if (qDigits && item.codigo.includes(qDigits)) return true;
          return item.descricao.toLowerCase().includes(q);
        })
        .slice(0, 30);

      res.json(filtered);
    } catch {
      res.json([]);
    }
  });

  // Test Casa dos Dados API Key
  app.post('/api/test-key', async (req: Request, res: Response) => {
    const apiKey = String(req.headers['x-api-key'] || req.body?.apiKey || '').trim();
    const apiUrl = String(req.headers['x-api-url'] || req.body?.apiUrl || DEFAULT_CDD_SEARCH_URL).trim();

    if (!apiKey) {
      res.status(400).json({ ok: false, error: 'Informe uma API Key válida.' });
      return;
    }

    try {
      const response = await fetchJsonWithTimeout(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          situacao_cadastral: ['ATIVA'],
          uf: ['PI'],
          limite: 1,
          pagina: 1,
        }),
      });

      if (response.ok) {
        res.json({ ok: true });
        return;
      }

      const text = await response.text().catch(() => '');
      res.status(response.status).json({
        ok: false,
        error:
          response.status === 401 || response.status === 403
            ? 'API Key recusada ou expirada (401/403).'
            : `Erro ${response.status}: ${text.slice(0, 150)}`,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Erro de conexão com Casa dos Dados',
      });
    }
  });

  // Advanced Search proxy -> Casa dos Dados API v5
  app.post('/api/search', async (req: Request, res: Response) => {
    const apiKey = String(req.headers['x-api-key'] || process.env.CASA_DOS_DADOS_API_KEY || '').trim();
    const apiUrl = String(req.headers['x-api-url'] || DEFAULT_CDD_SEARCH_URL).trim();
    const { filters, enrichMissing = true } = req.body as {
      filters: AdvancedSearchFilters;
      enrichMissing?: boolean;
    };

    if (!apiKey) {
      res.status(401).json({
        code: 'API_KEY_REQUIRED',
        error:
          'Configure sua API Key da Casa dos Dados para executar a Pesquisa Avançada, ou utilize a aba "Consulta em Lote (Gratuita)" para extrair por lista de CNPJs.',
      });
      return;
    }

    const payload = buildCasaDosDadosPayload(filters);

    try {
      const apiRes = await fetchJsonWithTimeout(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      }, 20000);

      if (!apiRes.ok) {
        const errBody = await apiRes.text().catch(() => '');
        let friendly = `Erro ${apiRes.status} na API Casa dos Dados.`;
        if (apiRes.status === 401 || apiRes.status === 403) {
          friendly = 'API Key da Casa dos Dados inválida, sem saldo ou expirada.';
        } else if (apiRes.status === 429) {
          friendly = 'Limite de requisições atingido. Aguarde alguns segundos e tente novamente.';
        } else if (errBody) {
          friendly = `Erro ${apiRes.status}: ${errBody.slice(0, 220)}`;
        }
        res.status(apiRes.status).json({ error: friendly });
        return;
      }

      const data = (await apiRes.json()) as Record<string, unknown>;
      const dataObj =
        typeof data.data === 'object' && data.data !== null
          ? (data.data as Record<string, unknown>)
          : null;

      const rawList = Array.isArray(data.cnpjs)
        ? data.cnpjs
        : Array.isArray(dataObj?.cnpj)
          ? (dataObj.cnpj as unknown[])
          : Array.isArray(dataObj?.cnpjs)
            ? (dataObj.cnpjs as unknown[])
            : Array.isArray(data.resultados)
              ? data.resultados
              : [];

      const total = Number(data.total ?? dataObj?.count ?? rawList.length);
      let records: CompanyRecord[] = rawList
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map(normalizeRawCompany);

      // Enrich missing email, telefone, or dataSituacao using detail endpoint / public fallback (capped at 20 per page)
      if (enrichMissing && records.length > 0) {
        const enriched: CompanyRecord[] = [];
        const batchSize = 5;
        for (let i = 0; i < records.length; i += batchSize) {
          const slice = records.slice(i, i + batchSize);
          const resolved = await Promise.all(
            slice.map(async (rec) => {
              const needsEnrich = !rec.dataSituacao || !rec.email || !rec.telefone;
              if (!needsEnrich || !rec.cnpj) return rec;
              try {
                const { record: detail } = await lookupSingleCnpj(rec.cnpj, apiKey);
                return mergeCompanyRecords(rec, detail);
              } catch {
                return rec;
              }
            })
          );
          enriched.push(...resolved);
        }
        records = enriched;
      }

      res.json({
        total,
        pagina: filters.pagina || 1,
        limite: filters.limite || 20,
        records,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Falha de rede ao consultar Casa dos Dados.',
      });
    }
  });

  // Free sequential batch lookup queue (450ms interval, MinhaReceita <-> BrasilAPI rotation)
  app.post('/api/cnpj/lookup', async (req: Request, res: Response) => {
    const apiKey = String(req.headers['x-api-key'] || '').trim() || undefined;
    const rawCnpjs = Array.isArray(req.body?.cnpjs) ? (req.body.cnpjs as string[]) : [];
    const cnpjs = rawCnpjs.map((c) => onlyDigits(String(c))).filter((c) => c.length === 14).slice(0, 10);

    if (cnpjs.length === 0) {
      res.status(400).json({ error: 'Nenhum CNPJ válido enviado.' });
      return;
    }

    const { results, errors, providersUsed } = await processCnpjQueue(cnpjs, apiKey);
    res.json({ results, errors, providersUsed });
  });

  // Full queue endpoint alias (/api/batch-extract) for direct batch calls
  app.post('/api/batch-extract', async (req: Request, res: Response) => {
    const apiKey = String(req.headers['x-api-key'] || '').trim() || undefined;
    const rawCnpjs = Array.isArray(req.body?.cnpjs) ? (req.body.cnpjs as string[]) : [];
    const cnpjs = rawCnpjs.map((c) => onlyDigits(String(c))).filter((c) => c.length === 14).slice(0, 50);

    if (cnpjs.length === 0) {
      res.status(400).json({ error: 'Nenhum CNPJ válido enviado.' });
      return;
    }

    const { results, errors, providersUsed } = await processCnpjQueue(cnpjs, apiKey);
    res.json({ total: results.length, empresas: results, errors, providersUsed });
  });

  // CORS preflight for browser Bookmarklet / Console Script running on casadosdados.com.br
  app.options('/api/import-cnpjs', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
  });

  // Receive CNPJs or scraped company records from the browser Bookmarklet and enrich via sequential 450ms queue
  app.post('/api/import-cnpjs', async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const rawRecords = Array.isArray(req.body?.records)
      ? (req.body.records as Array<Record<string, unknown>>)
      : [];
    const rawCnpjs = Array.isArray(req.body?.cnpjs) ? (req.body.cnpjs as string[]) : [];

    const imported: CompanyRecord[] = [];
    const seen = new Set<string>();

    // Handle pre-parsed records from browser script (enrich missing fields sequentially with 450ms delay)
    const recordsSlice = rawRecords.slice(0, 40);
    for (let i = 0; i < recordsSlice.length; i++) {
      const norm = normalizeRawCompany(recordsSlice[i]);
      const digits = onlyDigits(norm.cnpj);
      if (digits.length !== 14 || seen.has(digits)) continue;
      seen.add(digits);

      if (!norm.dataSituacao || !norm.situacaoCadastral || !norm.municipio || !norm.email || !norm.telefone) {
        try {
          const { record: detail } = await lookupSingleCnpj(digits);
          imported.push(mergeCompanyRecords(norm, detail));
        } catch {
          imported.push(norm);
        }
        await sleep(FREE_QUEUE_DELAY_MS);
      } else {
        imported.push(norm);
      }
    }

    // Handle plain CNPJ list through the sequential 450ms round-robin queue
    const pendingCnpjs = rawCnpjs
      .map((c) => onlyDigits(String(c)))
      .filter((d) => d.length === 14 && !seen.has(d))
      .slice(0, 40);

    if (pendingCnpjs.length > 0) {
      const { results } = await processCnpjQueue(pendingCnpjs);
      imported.push(...results);
    }

    if (imported.length > 0) {
      pendingBookmarkletRecords.push(...imported);
    }

    res.json({ imported: imported.length, records: imported });
  });

  // Frontend polls pending records pushed by the Bookmarklet
  app.get('/api/import-cnpjs/pending', (_req: Request, res: Response) => {
    const batch = pendingBookmarkletRecords;
    pendingBookmarkletRecords = [];
    res.json({ records: batch });
  });

  // Native styled Excel (.xlsx) export containing strictly the 8 requested columns
  app.post('/api/export/xlsx', async (req: Request, res: Response) => {
    const records = Array.isArray(req.body?.records) ? (req.body.records as CompanyRecord[]) : [];
    const fileNameRaw = String(req.body?.fileName || 'extrator-cnpj').replace(/[^a-zA-Z0-9_-]/g, '_');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Extrator CNPJ';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Empresas', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: 'CNPJ', key: 'cnpj', width: 22 },
      { header: 'Razão Social', key: 'razaoSocial', width: 46 },
      { header: 'Situação Cadastral', key: 'situacaoCadastral', width: 20 },
      { header: 'Data da Situação', key: 'dataSituacao', width: 18 },
      { header: 'Município', key: 'municipio', width: 28 },
      { header: 'Estado', key: 'estado', width: 10 },
      { header: 'Email', key: 'email', width: 34 },
      { header: 'Telefone', key: 'telefone', width: 28 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' },
      };
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF334155' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } },
      };
    });

    sheet.autoFilter = 'A1:H1';

    records.forEach((rec, index) => {
      const row = sheet.addRow({
        cnpj: rec.cnpj || '',
        razaoSocial: rec.razaoSocial || '',
        situacaoCadastral: rec.situacaoCadastral || '',
        dataSituacao: rec.dataSituacao || '',
        municipio: rec.municipio || '',
        estado: rec.estado || '',
        email: rec.email || '',
        telefone: rec.telefone || '',
      });
      row.height = 21;
      const isEven = index % 2 === 1;
      row.eachCell((cell) => {
        // Explicit text format (@) preserves CNPJ leading zeros and phone formatting
        cell.numFmt = '@';
        cell.font = {
          name: 'Calibri',
          size: 10.5,
          color: { argb: 'FF111827' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        if (isEven) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' },
          };
        }
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
          right: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileNameRaw}.xlsx"`);
    res.send(Buffer.from(buffer));
  });

  // Vite dev middleware or static dist serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('/{*splat}', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Extrator CNPJ server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
