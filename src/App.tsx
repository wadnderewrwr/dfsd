import React, { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, KeyRound } from 'lucide-react';
import {
  DEFAULT_FILTERS,
  type AdvancedSearchFilters,
  type CompanyRecord,
  type SavedPreset,
} from './shared/cnpj';
import { AdvancedSearchPanel } from './components/AdvancedSearchPanel';
import { BatchLookupPanel } from './components/BatchLookupPanel';
import { SiteExtractorPanel } from './components/SiteExtractorPanel';
import { ResultsWorkspace } from './components/ResultsWorkspace';
import { ApiSettingsModal } from './components/ApiSettingsModal';
import { SaveShareModal } from './components/SaveShareModal';

type WorkspaceMode = 'avancada' | 'site' | 'lote';

const STORAGE_RECORDS_KEY = 'extrator_cnpj_records_v1';
const STORAGE_API_KEY = 'extrator_cnpj_api_key_v1';
const STORAGE_API_URL = 'extrator_cnpj_api_url_v1';
const STORAGE_ENRICH = 'extrator_cnpj_enrich_v1';
const STORAGE_PRESETS = 'extrator_cnpj_presets_v1';

function loadInitialFilters(): AdvancedSearchFilters {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('f');
    if (encoded) {
      const json = decodeURIComponent(escape(atob(encoded)));
      const parsed = JSON.parse(json) as Partial<AdvancedSearchFilters>;
      return { ...DEFAULT_FILTERS, ...parsed };
    }
  } catch {
    // Ignore malformed query string
  }
  return DEFAULT_FILTERS;
}

export default function App() {
  const [mode, setMode] = useState<WorkspaceMode>('avancada');
  const [filters, setFilters] = useState<AdvancedSearchFilters>(loadInitialFilters);

  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_API_KEY) || '');
  const [apiUrl, setApiUrl] = useState(
    () =>
      localStorage.getItem(STORAGE_API_URL) ||
      'https://api.casadosdados.com.br/v5/cnpj/pesquisa'
  );
  const [enrichMissing, setEnrichMissing] = useState(
    () => localStorage.getItem(STORAGE_ENRICH) !== 'false'
  );

  const [records, setRecords] = useState<CompanyRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_RECORDS_KEY);
      return saved ? (JSON.parse(saved) as CompanyRecord[]) : [];
    } catch {
      return [];
    }
  });

  const [presets, setPresets] = useState<SavedPreset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PRESETS);
      return saved ? (JSON.parse(saved) as SavedPreset[]) : [];
    } catch {
      return [];
    }
  });

  const [selectedCnpjs, setSelectedCnpjs] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<{
    message: string;
    needsKey?: boolean;
  } | null>(null);
  const [totalApiResults, setTotalApiResults] = useState<number | null>(null);

  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [saveShareOpen, setSaveShareOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_RECORDS_KEY, JSON.stringify(records));
    } catch {
      // Ignore storage quota errors
    }
  }, [records]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PRESETS, JSON.stringify(presets));
    } catch {
      // Ignore storage quota errors
    }
  }, [presets]);

  // Poll incoming companies pushed by the browser Bookmarklet / Console script
  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/import-cnpjs/pending');
        if (!res.ok) return;
        const data = (await res.json()) as { records?: CompanyRecord[] };
        if (active && Array.isArray(data.records) && data.records.length > 0) {
          setRecords((prev) => {
            const map = new Map<string, CompanyRecord>();
            for (const r of prev) map.set(r.cnpj, r);
            for (const r of data.records!) map.set(r.cnpj, r);
            return Array.from(map.values());
          });
        }
      } catch {
        // Ignore transient poll errors
      }
    };
    const timer = setInterval(poll, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const executeSearch = async (targetPage = 1) => {
    setIsSearching(true);
    setSearchError(null);
    const nextFilters = { ...filters, pagina: targetPage };
    setFilters(nextFilters);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
          ...(apiUrl ? { 'x-api-url': apiUrl } : {}),
        },
        body: JSON.stringify({
          filters: nextFilters,
          enrichMissing,
        }),
      });

      const data = (await res.json()) as {
        code?: string;
        error?: string;
        total?: number;
        records?: CompanyRecord[];
      };

      if (!res.ok) {
        setSearchError({
          message: data.error || `Erro HTTP ${res.status} na pesquisa.`,
          needsKey: data.code === 'API_KEY_REQUIRED' || res.status === 401,
        });
        return;
      }

      const incoming = data.records || [];
      setTotalApiResults(typeof data.total === 'number' ? data.total : incoming.length);
      setRecords(incoming);
      setSelectedCnpjs(new Set());
    } catch (err) {
      setSearchError({
        message: err instanceof Error ? err.message : 'Falha de comunicação com o servidor.',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleRecordsExtracted = (
    incoming: CompanyRecord[],
    mergeMode: 'append' | 'replace'
  ) => {
    setSearchError(null);
    if (mergeMode === 'replace') {
      setRecords(incoming);
      setSelectedCnpjs(new Set());
      setTotalApiResults(incoming.length);
      return;
    }

    setRecords((prev) => {
      const map = new Map<string, CompanyRecord>();
      for (const r of prev) map.set(r.cnpj, r);
      for (const r of incoming) map.set(r.cnpj, r);
      return Array.from(map.values());
    });
    setTotalApiResults(null);
  };

  const handleToggleSelect = (cnpj: string) => {
    setSelectedCnpjs((prev) => {
      const next = new Set(prev);
      if (next.has(cnpj)) next.delete(cnpj);
      else next.add(cnpj);
      return next;
    });
  };

  const handleToggleSelectAll = (visibleCnpjs: string[]) => {
    const allSelected =
      visibleCnpjs.length > 0 && visibleCnpjs.every((c) => selectedCnpjs.has(c));
    setSelectedCnpjs((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleCnpjs.forEach((c) => next.delete(c));
      } else {
        visibleCnpjs.forEach((c) => next.add(c));
      }
      return next;
    });
  };

  const handleRemoveSelected = () => {
    setRecords((prev) => prev.filter((r) => !selectedCnpjs.has(r.cnpj)));
    setSelectedCnpjs(new Set());
  };

  const handleSaveApiSettings = (next: {
    apiKey: string;
    apiUrl: string;
    enrichMissing: boolean;
  }) => {
    setApiKey(next.apiKey);
    setApiUrl(next.apiUrl);
    setEnrichMissing(next.enrichMissing);
    localStorage.setItem(STORAGE_API_KEY, next.apiKey);
    localStorage.setItem(STORAGE_API_URL, next.apiUrl);
    localStorage.setItem(STORAGE_ENRICH, String(next.enrichMissing));
    setSearchError(null);
  };

  const handleSavePreset = (name: string) => {
    const preset: SavedPreset = {
      id: `${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      filters,
    };
    setPresets((prev) => [preset, ...prev]);
  };

  return (
    <div className="min-h-screen bg-[#141518] text-[#E5E7EB] flex flex-col">
      {/* Top Bar Contract: Brand — Concise Mode Links — Primary Action */}
      <header className="border-b border-[#26282F] bg-[#18191D]">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="/"
            className="text-[16px] font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Extrator CNPJ
          </a>

          <nav className="flex items-center gap-7">
            <button
              type="button"
              onClick={() => setMode('avancada')}
              className={`text-[13.5px] font-medium py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                mode === 'avancada'
                  ? 'text-white border-[#2EB872]'
                  : 'text-[#9CA3AF] hover:text-white border-transparent'
              }`}
            >
              Pesquisa Avançada
            </button>
            <button
              type="button"
              onClick={() => setMode('site')}
              className={`text-[13.5px] font-medium py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                mode === 'site'
                  ? 'text-white border-[#2EB872]'
                  : 'text-[#9CA3AF] hover:text-white border-transparent'
              }`}
            >
              Extrair do Site (Sem API)
            </button>
            <button
              type="button"
              onClick={() => setMode('lote')}
              className={`text-[13.5px] font-medium py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                mode === 'lote'
                  ? 'text-white border-[#2EB872]'
                  : 'text-[#9CA3AF] hover:text-white border-transparent'
              }`}
            >
              Consulta em Lote
            </button>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setApiModalOpen(true)}
              className="inline-flex items-center gap-2 bg-[#212227] hover:bg-[#2A2C33] border border-[#363840] text-[#E5E7EB] text-[13px] font-medium px-3.5 py-1.5 rounded-[4px] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#2EB872]" />
              <span>{apiKey ? 'API Configurada' : 'Configurar API'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Desktop Viewport */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-5">
        {mode === 'avancada' ? (
          <AdvancedSearchPanel
            filters={filters}
            onChange={setFilters}
            onSearch={() => executeSearch(1)}
            onOpenSaveShare={() => setSaveShareOpen(true)}
            onReset={() => {
              setFilters(DEFAULT_FILTERS);
              setSearchError(null);
            }}
            isSearching={isSearching}
          />
        ) : mode === 'site' ? (
          <SiteExtractorPanel
            filters={filters}
            onRecordsExtracted={handleRecordsExtracted}
          />
        ) : (
          <BatchLookupPanel
            apiKey={apiKey}
            onRecordsExtracted={handleRecordsExtracted}
          />
        )}

        {searchError && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-[#261A1C] border border-[#5B2A30] rounded-[4px] px-4 py-3 text-[13px] text-[#FCA5A5]">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#F87171]" />
              <span>{searchError.message}</span>
            </div>
            {searchError.needsKey && (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="https://casadosdados.com.br/solucao/cnpj/pesquisa-avancada"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setSearchError(null);
                    setMode('site');
                  }}
                  className="inline-flex items-center gap-1.5 bg-[#1A6FB3] hover:bg-[#175F9A] text-white text-[12px] font-semibold px-3 py-1.5 rounded-[4px] whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir Casa dos Dados e Extrair (Sem API)</span>
                </a>
                <button
                  type="button"
                  onClick={() => setApiModalOpen(true)}
                  className="bg-[#2EB872] hover:bg-[#27A364] text-white text-[12px] font-semibold px-3 py-1.5 rounded-[4px] cursor-pointer whitespace-nowrap"
                >
                  Inserir API Key
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchError(null);
                    setMode('lote');
                  }}
                  className="bg-[#212227] hover:bg-[#2A2C33] border border-[#3B3E47] text-[#E5E7EB] text-[12px] font-medium px-3 py-1.5 rounded-[4px] cursor-pointer whitespace-nowrap"
                >
                  Consulta em Lote (Gratuita)
                </button>
              </div>
            )}
          </div>
        )}

        <ResultsWorkspace
          records={records}
          selectedCnpjs={selectedCnpjs}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onClearRecords={() => {
            setRecords([]);
            setSelectedCnpjs(new Set());
            setTotalApiResults(null);
          }}
          onRemoveSelected={handleRemoveSelected}
          totalApiResults={totalApiResults}
          currentPage={filters.pagina}
          pageSize={filters.limite}
          onPageChange={mode === 'avancada' && totalApiResults ? executeSearch : undefined}
          isLoading={isSearching}
        />
      </main>

      <ApiSettingsModal
        open={apiModalOpen}
        onClose={() => setApiModalOpen(false)}
        apiKey={apiKey}
        apiUrl={apiUrl}
        enrichMissing={enrichMissing}
        onSave={handleSaveApiSettings}
      />

      <SaveShareModal
        open={saveShareOpen}
        onClose={() => setSaveShareOpen(false)}
        currentFilters={filters}
        presets={presets}
        onSavePreset={handleSavePreset}
        onLoadPreset={(p) => {
          setFilters(p.filters);
          setMode('avancada');
        }}
        onDeletePreset={(id) =>
          setPresets((prev) => prev.filter((item) => item.id !== id))
        }
      />
    </div>
  );
}
