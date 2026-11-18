import React, { useRef, useState } from 'react';
import { FileSpreadsheet, Search, Upload, Trash2 } from 'lucide-react';
import {
  extractCnpjsFromText,
  normalizeRawCompany,
  type CompanyRecord,
} from '../shared/cnpj';

interface BatchLookupPanelProps {
  apiKey: string;
  onRecordsExtracted: (records: CompanyRecord[], mode: 'append' | 'replace') => void;
}

function parseRawCsvToRecords(text: string): CompanyRecord[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const splitRow = (row: string) => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitRow(lines[0]).map((h) =>
    h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  );

  const findIdx = (patterns: string[]) =>
    headers.findIndex((h) => patterns.some((p) => h.includes(p)));

  const idxCnpj = findIdx(['cnpj']);
  const idxRazao = findIdx(['razao', 'empresa', 'nome']);
  const idxSit = findIdx(['situacao']);
  const idxDataSit = findIdx(['data_situacao', 'data da situacao', 'data situacao']);
  const idxMun = findIdx(['municipio', 'cidade']);
  const idxUf = findIdx(['uf', 'estado']);
  const idxEmail = findIdx(['email', 'e-mail', 'correio']);
  const idxTel = findIdx(['telefone', 'celular', 'fone', 'contato']);

  if (idxCnpj === -1) return [];

  const records: CompanyRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    const rawObj: Record<string, unknown> = {
      cnpj: cols[idxCnpj] ?? '',
      razao_social: idxRazao >= 0 ? cols[idxRazao] : '',
      situacao_cadastral: idxSit >= 0 ? cols[idxSit] : '',
      data_situacao_cadastral: idxDataSit >= 0 ? cols[idxDataSit] : '',
      municipio: idxMun >= 0 ? cols[idxMun] : '',
      uf: idxUf >= 0 ? cols[idxUf] : '',
      email: idxEmail >= 0 ? cols[idxEmail] : '',
      telefone: idxTel >= 0 ? cols[idxTel] : '',
    };
    const normalized = normalizeRawCompany(rawObj);
    if (normalized.cnpj) records.push(normalized);
  }
  return records;
}

export function BatchLookupPanel({ apiKey, onRecordsExtracted }: BatchLookupPanelProps) {
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<Array<{ cnpj: string; error: string }>>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectedCnpjs = extractCnpjsFromText(rawText);

  const handleConsultBatch = async () => {
    if (detectedCnpjs.length === 0) return;
    setIsProcessing(true);
    setErrors([]);
    setStatusMessage('');
    setProgress({ done: 0, total: detectedCnpjs.length });

    const allResults: CompanyRecord[] = [];
    const allErrors: Array<{ cnpj: string; error: string }> = [];
    const totalProviders: Record<string, number> = {};

    try {
      const chunkSize = 5;
      for (let i = 0; i < detectedCnpjs.length; i += chunkSize) {
        const chunk = detectedCnpjs.slice(i, i + chunkSize);
        const res = await fetch('/api/cnpj/lookup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'x-api-key': apiKey } : {}),
          },
          body: JSON.stringify({ cnpjs: chunk }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            results: CompanyRecord[];
            errors: Array<{ cnpj: string; error: string }>;
            providersUsed?: Record<string, number>;
          };
          allResults.push(...data.results);
          allErrors.push(...data.errors);
          if (data.providersUsed) {
            for (const [k, v] of Object.entries(data.providersUsed)) {
              totalProviders[k] = (totalProviders[k] || 0) + v;
            }
          }
        } else {
          for (const c of chunk) {
            allErrors.push({ cnpj: c, error: `Falha HTTP ${res.status}` });
          }
        }
        setProgress({ done: Math.min(i + chunk.length, detectedCnpjs.length), total: detectedCnpjs.length });
      }

      if (allResults.length > 0) {
        onRecordsExtracted(allResults, 'append');
      }
      setErrors(allErrors);
      const providerSummary = Object.entries(totalProviders)
        .map(([name, count]) => `${name}: ${count}`)
        .join(', ');
      setStatusMessage(
        `${allResults.length} empresa(s) extraída(s) com sucesso${
          providerSummary ? ` (${providerSummary})` : ''
        }${allErrors.length > 0 ? ` · ${allErrors.length} não encontrada(s)` : ''}.`
      );
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Erro ao consultar CNPJs.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    e.target.value = '';

    // Check if JSON array
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.cnpjs)
            ? parsed.cnpjs
            : [];
        const normalized = arr
          .filter((x: unknown): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
          .map(normalizeRawCompany)
          .filter((r: CompanyRecord) => Boolean(r.cnpj));

        if (normalized.length > 0) {
          onRecordsExtracted(normalized, 'append');
          setStatusMessage(`${normalized.length} empresa(s) importada(s) e formatada(s) do JSON.`);
          return;
        }
      } catch {
        // Fallback to extracting CNPJs from text
      }
    }

    // Check if structured CSV with columns
    if (file.name.toLowerCase().endsWith('.csv')) {
      const parsedCsv = parseRawCsvToRecords(text);
      if (parsedCsv.length > 0 && parsedCsv.some((r) => r.razaoSocial)) {
        onRecordsExtracted(parsedCsv, 'append');
        setStatusMessage(
          `${parsedCsv.length} empresa(s) importada(s) do CSV e padronizada(s) nos 8 campos.`
        );
        return;
      }
    }

    // Otherwise extract all CNPJs found in the file into textarea for API lookup
    setRawText((prev) => (prev ? `${prev}\n${text}` : text));
    const found = extractCnpjsFromText(text);
    setStatusMessage(`${found.length} CNPJ(s) detectado(s) no arquivo. Clique em "Extrair Dados".`);
  };

  return (
    <div className="bg-[#1B1C20] border border-[#2C2E35] rounded-md px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-white">
            Consulta Direta por CNPJ em Lote & Conversor de Planilha
          </h2>
          <p className="text-[13px] text-[#9CA3AF] mt-1">
            Cole CNPJs (com ou sem pontuação) para consultar gratuitamente as bases públicas da Receita Federal, ou importe um arquivo CSV/JSON exportado da Casa dos Dados para limpar e converter nos 8 campos obrigatórios.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.json"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 bg-[#212227] hover:bg-[#2A2C33] border border-[#363840] text-[#E5E7EB] text-[13px] font-medium px-3.5 py-2 rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-[#3B9AE8]" />
            <span>Importar TXT / CSV / JSON</span>
          </button>
        </div>
      </div>

      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={5}
        placeholder="Cole aqui um ou vários CNPJs separados por vírgula, espaço ou quebra de linha (ex: 00.000.000/0001-91, 33000167000101)..."
        className="w-full bg-[#212227] border border-[#363840] focus:border-[#2585D6] rounded-[4px] p-3 font-mono-data text-[13px] text-[#E5E7EB] placeholder-[#6B7280] placeholder:font-sans focus:outline-none resize-y"
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isProcessing || detectedCnpjs.length === 0}
            onClick={handleConsultBatch}
            className="inline-flex items-center gap-2 bg-[#2EB872] hover:bg-[#27A364] disabled:opacity-50 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Search className="w-4 h-4" />
            <span>
              {isProcessing
                ? `Extraindo (${progress?.done ?? 0}/${progress?.total ?? 0})...`
                : `Extrair Dados (${detectedCnpjs.length} CNPJ${detectedCnpjs.length === 1 ? '' : 's'})`}
            </span>
          </button>

          {rawText && (
            <button
              type="button"
              onClick={() => {
                setRawText('');
                setErrors([]);
                setStatusMessage('');
              }}
              className="inline-flex items-center gap-1.5 text-[13px] text-[#9CA3AF] hover:text-white px-3 py-2 rounded-[4px] transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar caixa</span>
            </button>
          )}
        </div>

        <div className="text-[12px] text-[#9CA3AF] flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[#2EB872]" />
          <span>Saída restrita aos 8 campos padronizados para Excel</span>
        </div>
      </div>

      {isProcessing && progress && (
        <div className="mt-4">
          <div className="h-1.5 w-full bg-[#26282E] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2EB872] transition-all duration-200"
              style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="mt-3 text-[13px] text-[#D1D5DB] bg-[#212227] border border-[#34363C] rounded-[4px] px-3.5 py-2">
          {statusMessage}
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-3 bg-[#2A1C1E] border border-[#5B2A30] rounded-[4px] px-3.5 py-2.5 text-[12px] text-[#FCA5A5] max-h-28 overflow-y-auto">
          {errors.map((er, idx) => (
            <div key={idx} className="font-mono-data">
              {er.cnpj}: {er.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
