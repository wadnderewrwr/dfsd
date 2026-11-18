import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FileJson,
  Play,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  extractCnpjsFromText,
  normalizeRawCompany,
  onlyDigits,
  type AdvancedSearchFilters,
  type CompanyRecord,
} from '../shared/cnpj';

interface SiteExtractorPanelProps {
  filters: AdvancedSearchFilters;
  onRecordsExtracted: (records: CompanyRecord[], mode: 'append' | 'replace') => void;
}

function buildBrowserExtractorScript(appOrigin: string): string {
  const endpoint = `${appOrigin}/api/import-cnpjs`;
  return `(async function(){
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:999999;background:#1B1C20;color:#fff;border:1px solid #2EB872;border-radius:6px;padding:12px 16px;font:13px/1.4 sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45);max-width:360px';
  document.body.appendChild(box);
  const links = Array.from(document.querySelectorAll('a[href*="/solucao/cnpj/"]'))
    .map(a => a.href)
    .filter((href, idx, arr) => !href.includes('/pesquisa-avancada') && /\\d{14}/.test(href) && arr.indexOf(href) === idx);
  const textCnpjs = Array.from(new Set((document.body.innerText.match(/\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2}/g) || []).map(c => c.replace(/\\D/g, ''))));
  if (!links.length && !textCnpjs.length) {
    box.style.borderColor = '#EF4444';
    box.textContent = 'Nenhum CNPJ ou link de empresa encontrado nesta página. Execute a pesquisa na Casa dos Dados primeiro.';
    setTimeout(() => box.remove(), 5000);
    return;
  }
  const pick = (txt, labels) => {
    for (const lb of labels) {
      const re = new RegExp(lb + '\\\\s*:?\\\\s*\\\\n?\\\\s*([^\\\\n]+)', 'i');
      const m = txt.match(re);
      if (m && m[1] && m[1].trim() && !/^(CNPJ|Raz|Situa|Data|Munic|Estado|UF|Email|E-mail|Telef)/i.test(m[1].trim())) {
        return m[1].trim();
      }
    }
    return '';
  };
  const results = [];
  if (links.length) {
    for (let i = 0; i < links.length; i++) {
      const url = links[i];
      box.textContent = 'Entrando no resultado ' + (i + 1) + ' de ' + links.length + '...';
      const cnpjMatch = url.match(/(\\d{14})(?:\\/?$|\\?)/);
      const cnpj = cnpjMatch ? cnpjMatch[1] : '';
      try {
        const html = await fetch(url, { credentials: 'include' }).then(r => r.text());
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const txt = (doc.body ? doc.body.innerText : '').replace(/\\r/g, '');
        const razao = pick(txt, ['Razão Social', 'Razao Social']) || (doc.querySelector('h1')?.textContent || '').trim();
        const situacao = pick(txt, ['Situação Cadastral', 'Situacao Cadastral']);
        const dataSit = pick(txt, ['Data da Situação Cadastral', 'Data da Situação', 'Data Situação']);
        const municipio = pick(txt, ['Município', 'Municipio']);
        const uf = pick(txt, ['Estado', 'UF']);
        const emailMatch = txt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g);
        const telMatch = txt.match(/(?:\\(?\\d{2}\\)?\\s*\\d{4,5}-?\\d{4})/g);
        results.push({
          cnpj,
          razao_social: razao,
          situacao_cadastral: situacao,
          data_situacao_cadastral: dataSit,
          municipio,
          uf,
          email: emailMatch ? Array.from(new Set(emailMatch)).join(', ') : '',
          telefone: telMatch ? Array.from(new Set(telMatch)).join(' / ') : ''
        });
      } catch (_) {
        if (cnpj) results.push({ cnpj });
      }
      await new Promise(r => setTimeout(r, 320));
    }
  } else {
    for (const c of textCnpjs) results.push({ cnpj: c });
  }
  box.textContent = 'Enviando ' + results.length + ' empresas para o Extrator PC...';
  let sent = false;
  try {
    const res = await fetch('${endpoint}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: results })
    });
    if (res.ok) sent = true;
  } catch (_) {}
  if (sent) {
    box.textContent = 'Pronto! ' + results.length + ' empresa(s) enviada(s) direto para a tabela do Extrator PC.';
  } else {
    const json = JSON.stringify(results, null, 2);
    try { await navigator.clipboard.writeText(json); } catch (_) {}
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'casadosdados-extraidos.json';
    a.click();
    box.textContent = 'Extraído! Arquivo casadosdados-extraidos.json baixado (e copiado). Importe no Extrator PC.';
  }
  setTimeout(() => box.remove(), 6500);
})();`;
}

export function SiteExtractorPanel({
  filters,
  onRecordsExtracted,
}: SiteExtractorPanelProps) {
  const [pastedInput, setPastedInput] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errors, setErrors] = useState<Array<{ cnpj: string; error: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectedCnpjs = useMemo(() => extractCnpjsFromText(pastedInput), [pastedInput]);

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (filters.termo) chips.push(`Termo: ${filters.termo}`);
    if (filters.cnae) chips.push(`CNAE: ${filters.cnae}`);
    if (filters.situacaoCadastral.length) chips.push(`Situação: ${filters.situacaoCadastral.join(', ')}`);
    if (filters.ufs.length) chips.push(`UF: ${filters.ufs.join(', ')}`);
    if (filters.municipios.length) chips.push(`Município: ${filters.municipios.join(', ')}`);
    if (filters.ddd) chips.push(`DDD: ${filters.ddd}`);
    if (filters.comEmail) chips.push('Com e-mail');
    if (filters.somenteCelular) chips.push('Somente celular');
    return chips;
  }, [filters]);

  const browserScript = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return buildBrowserExtractorScript(origin);
  }, []);

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(browserScript);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const enrichViaPublicApi = async (
    cnpjs: string[],
    existingByCnpj?: Map<string, CompanyRecord>
  ) => {
    const finalMap = new Map<string, CompanyRecord>(existingByCnpj || []);
    const allErrors: Array<{ cnpj: string; error: string }> = [];
    const chunkSize = 10;

    setProgress({ done: 0, total: cnpjs.length });

    for (let i = 0; i < cnpjs.length; i += chunkSize) {
      const chunk = cnpjs.slice(i, i + chunkSize);
      const res = await fetch('/api/cnpj/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpjs: chunk }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          results: CompanyRecord[];
          errors: Array<{ cnpj: string; error: string }>;
        };
        for (const rec of data.results) {
          const digits = onlyDigits(rec.cnpj);
          const prev = finalMap.get(digits);
          if (prev) {
            finalMap.set(digits, {
              cnpj: prev.cnpj || rec.cnpj,
              razaoSocial: prev.razaoSocial || rec.razaoSocial,
              situacaoCadastral: prev.situacaoCadastral || rec.situacaoCadastral,
              dataSituacao: prev.dataSituacao || rec.dataSituacao,
              municipio: prev.municipio || rec.municipio,
              estado: prev.estado || rec.estado,
              email: prev.email || rec.email,
              telefone: prev.telefone || rec.telefone,
            });
          } else {
            finalMap.set(digits, rec);
          }
        }
        allErrors.push(...data.errors);
      }
      setProgress({ done: Math.min(i + chunk.length, cnpjs.length), total: cnpjs.length });
    }

    return { records: Array.from(finalMap.values()), errors: allErrors };
  };

  const processPayload = async (rawContent: string) => {
    const trimmed = rawContent.trim();
    if (!trimmed) return;

    setIsProcessing(true);
    setStatusMessage('');
    setErrors([]);
    setProgress(null);

    try {
      // 1. Try JSON array from browser extractor script
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
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
            const byDigits = new Map<string, CompanyRecord>();
            const needEnrich: string[] = [];
            for (const rec of normalized) {
              const d = onlyDigits(rec.cnpj);
              byDigits.set(d, rec);
              if (!rec.dataSituacao || !rec.situacaoCadastral || !rec.municipio || !rec.email || !rec.telefone) {
                needEnrich.push(d);
              }
            }

            if (needEnrich.length > 0) {
              const enriched = await enrichViaPublicApi(needEnrich, byDigits);
              onRecordsExtracted(enriched.records, 'append');
              setErrors(enriched.errors);
              setStatusMessage(
                `${enriched.records.length} empresa(s) importada(s) do script e completada(s) nos 8 campos.`
              );
            } else {
              onRecordsExtracted(normalized, 'append');
              setStatusMessage(
                `${normalized.length} empresa(s) importada(s) do JSON com os 8 campos formatados.`
              );
            }
            return;
          }
        } catch {
          // Not valid JSON; continue to CNPJ/text extraction
        }
      }

      // 2. Extract all valid CNPJs from pasted page HTML / Ctrl+A text / URLs
      const cnpjs = extractCnpjsFromText(trimmed);
      if (cnpjs.length === 0) {
        setStatusMessage(
          'Nenhum CNPJ válido encontrado no texto colado. Copie a página de resultados da Casa dos Dados (Ctrl+A → Ctrl+C) ou importe o arquivo .json gerado pelo script.'
        );
        return;
      }

      const { records: extracted, errors: lookupErrors } = await enrichViaPublicApi(cnpjs);
      if (extracted.length > 0) {
        onRecordsExtracted(extracted, 'append');
      }
      setErrors(lookupErrors);
      setStatusMessage(
        `${extracted.length} empresa(s) extraída(s) e formatada(s) nos 8 campos${
          lookupErrors.length > 0 ? ` · ${lookupErrors.length} erro(s)` : ''
        }.`
      );
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Erro ao processar conteúdo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    e.target.value = '';
    setPastedInput(text);
    await processPayload(text);
  };

  const bookmarkletHref = `javascript:${encodeURIComponent(browserScript)}`;

  return (
    <div className="bg-[#1B1C20] border border-[#2C2E35] rounded-md px-6 py-5 space-y-5">
      {/* Header + Open Website CTA */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#2C2E35]">
        <div className="max-w-3xl">
          <h2 className="text-[15px] font-semibold text-white">
            Extrair Diretamente do Site Casa dos Dados (Sem API Key)
          </h2>
          <p className="text-[13px] text-[#9CA3AF] mt-1">
            Como o site exige verificação no navegador, você pode abrir a pesquisa no seu próprio navegador, coletar os resultados automaticamente com o script ou copiar a página (<span className="font-mono-data text-[#D1D5DB]">Ctrl+A → Ctrl+C</span>) e colar abaixo. O extrator busca todos os detalhes e entrega os 8 campos prontos para Excel.
          </p>
          {activeFilterChips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[#9CA3AF]">
              <span>Filtros preenchidos no painel:</span>
              {activeFilterChips.map((chip) => (
                <span
                  key={chip}
                  className="bg-[#212227] border border-[#363840] text-[#D1D5DB] px-2 py-0.5 rounded-[3px]"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        <a
          href="https://casadosdados.com.br/solucao/cnpj/pesquisa-avancada"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#1A6FB3] hover:bg-[#175F9A] text-white text-[13px] font-semibold px-4 py-2.5 rounded-[4px] transition-colors whitespace-nowrap shrink-0"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Abrir Casa dos Dados</span>
        </a>
      </div>

      {/* Two side-by-side PC workflows */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Browser Robot / Bookmarklet */}
        <div className="lg:col-span-5 bg-[#17181C] border border-[#2C2E35] rounded-[4px] p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <Terminal className="w-4 h-4 text-[#2EB872]" />
              <span>Opção 1: Entrar em cada resultado automaticamente</span>
            </div>
            <ol className="mt-3 space-y-2 text-[12.5px] text-[#D1D5DB] list-decimal list-inside">
              <li>
                Abra a pesquisa na Casa dos Dados e clique em <strong>Pesquisar</strong>.
              </li>
              <li>
                Na página de resultados, aperte <kbd className="px-1.5 py-0.5 bg-[#262830] rounded text-[11px] font-mono-data">F12</kbd> → aba <strong>Console</strong>, cole o script abaixo e aperte <strong>Enter</strong> (ou arraste o botão <em>Extrator Favorito</em> para sua barra de favoritos).
              </li>
              <li>
                O script entra em cada empresa da página, puxa os dados e baixa o arquivo <span className="font-mono-data text-white">casadosdados-extraidos.json</span>.
              </li>
            </ol>
          </div>

          <div className="mt-4 pt-3 border-t border-[#26282F] flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyScript}
              className="inline-flex items-center gap-1.5 bg-[#212227] hover:bg-[#2A2C33] border border-[#363840] text-white text-[12.5px] font-medium px-3.5 py-2 rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
            >
              {copiedScript ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#2EB872]" />
                  <span className="text-[#2EB872]">Script Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#3B9AE8]" />
                  <span>Copiar Script Extrator</span>
                </>
              )}
            </button>

            <a
              href={bookmarkletHref}
              onClick={(e) => e.preventDefault()}
              title="Arraste este botão para a Barra de Favoritos do seu navegador"
              className="inline-flex items-center gap-1.5 bg-[#212227] hover:bg-[#2A2C33] border border-dashed border-[#4B5563] text-[#D1D5DB] text-[12px] font-medium px-3 py-2 rounded-[4px] cursor-grab whitespace-nowrap"
            >
              <FileJson className="w-3.5 h-3.5 text-[#D99B16]" />
              <span>Arrastar p/ Favoritos</span>
            </a>
          </div>
        </div>

        {/* Right: Paste Page / Links / JSON */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <label className="text-[13px] font-semibold text-white">
              Opção 2: Cole aqui a página copiada (Ctrl+A / Ctrl+C), links ou o JSON baixado
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt,.html,.csv"
              onChange={handleFileImport}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 bg-[#212227] hover:bg-[#2A2C33] border border-[#363840] text-[#E5E7EB] text-[12px] font-medium px-3 py-1.5 rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-[#3B9AE8]" />
              <span>Importar .json / .html</span>
            </button>
          </div>

          <textarea
            value={pastedInput}
            onChange={(e) => setPastedInput(e.target.value)}
            rows={5}
            placeholder="Cole aqui o conteúdo copiado da página de resultados da Casa dos Dados (Ctrl+A → Ctrl+C), uma lista de URLs (/solucao/cnpj/...), ou o conteúdo de casadosdados-extraidos.json..."
            className="w-full bg-[#212227] border border-[#363840] focus:border-[#2585D6] rounded-[4px] p-3 font-mono-data text-[12.5px] text-[#E5E7EB] placeholder-[#6B7280] placeholder:font-sans focus:outline-none resize-y"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={isProcessing || !pastedInput.trim()}
                onClick={() => processPayload(pastedInput)}
                className="inline-flex items-center gap-2 bg-[#2EB872] hover:bg-[#27A364] disabled:opacity-50 text-white text-[13.5px] font-semibold px-5 py-2 rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  {isProcessing
                    ? progress
                      ? `Consultando (${progress.done}/${progress.total})...`
                      : 'Processando...'
                    : detectedCnpjs.length > 0 && !pastedInput.trim().startsWith('[')
                      ? `Extrair ${detectedCnpjs.length} Empresa(s)`
                      : 'Processar e Extrair 8 Campos'}
                </span>
              </button>

              {pastedInput && (
                <button
                  type="button"
                  onClick={() => {
                    setPastedInput('');
                    setStatusMessage('');
                    setErrors([]);
                  }}
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-[#9CA3AF] hover:text-white px-2.5 py-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar</span>
                </button>
              )}
            </div>

            {detectedCnpjs.length > 0 && (
              <span className="text-[12px] text-[#34D399] font-mono-data">
                {detectedCnpjs.length} CNPJ(s) válido(s) detectado(s)
              </span>
            )}
          </div>
        </div>
      </div>

      {isProcessing && progress && (
        <div className="h-1.5 w-full bg-[#26282E] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#2EB872] transition-all duration-200"
            style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
          />
        </div>
      )}

      {statusMessage && (
        <div className="text-[13px] text-[#D1D5DB] bg-[#212227] border border-[#34363C] rounded-[4px] px-3.5 py-2">
          {statusMessage}
        </div>
      )}

      {errors.length > 0 && (
        <div className="bg-[#2A1C1E] border border-[#5B2A30] rounded-[4px] px-3.5 py-2 text-[12px] text-[#FCA5A5] max-h-24 overflow-y-auto">
          {errors.map((er, i) => (
            <div key={i} className="font-mono-data">
              {er.cnpj}: {er.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
