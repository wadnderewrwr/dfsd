import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  Search,
  Trash2,
} from 'lucide-react';
import { buildCsvPtBr, type CompanyRecord } from '../shared/cnpj';

interface ResultsWorkspaceProps {
  records: CompanyRecord[];
  selectedCnpjs: Set<string>;
  onToggleSelect: (cnpj: string) => void;
  onToggleSelectAll: (visibleCnpjs: string[]) => void;
  onClearRecords: () => void;
  onRemoveSelected: () => void;
  totalApiResults: number | null;
  currentPage: number;
  pageSize: number;
  onPageChange?: (nextPage: number) => void;
  isLoading: boolean;
}

export function ResultsWorkspace({
  records,
  selectedCnpjs,
  onToggleSelect,
  onToggleSelectAll,
  onClearRecords,
  onRemoveSelected,
  totalApiResults,
  currentPage,
  pageSize,
  onPageChange,
  isLoading,
}: ResultsWorkspaceProps) {
  const [quickFilter, setQuickFilter] = useState('');
  const [activeCnpj, setActiveCnpj] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);

  const filteredRecords = useMemo(() => {
    const q = quickFilter.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.cnpj.toLowerCase().includes(q) ||
        r.razaoSocial.toLowerCase().includes(q) ||
        r.situacaoCadastral.toLowerCase().includes(q) ||
        r.municipio.toLowerCase().includes(q) ||
        r.estado.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.telefone.toLowerCase().includes(q)
    );
  }, [records, quickFilter]);

  const activeRecord = useMemo(() => {
    if (filteredRecords.length === 0) return null;
    if (activeCnpj) {
      const found = filteredRecords.find((r) => r.cnpj === activeCnpj);
      if (found) return found;
    }
    return filteredRecords[0];
  }, [filteredRecords, activeCnpj]);

  const visibleCnpjs = filteredRecords.map((r) => r.cnpj);
  const allVisibleSelected =
    visibleCnpjs.length > 0 && visibleCnpjs.every((c) => selectedCnpjs.has(c));

  const exportTargetRecords = useMemo(() => {
    if (selectedCnpjs.size > 0) {
      return records.filter((r) => selectedCnpjs.has(r.cnpj));
    }
    return filteredRecords;
  }, [records, filteredRecords, selectedCnpjs]);

  const handleCopy = async (key: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleCopyBlock = async (rec: CompanyRecord) => {
    const block = [
      `CNPJ: ${rec.cnpj}`,
      `Razão Social: ${rec.razaoSocial}`,
      `Situação Cadastral: ${rec.situacaoCadastral}`,
      `Data da Situação: ${rec.dataSituacao}`,
      `Município: ${rec.municipio}`,
      `Estado: ${rec.estado}`,
      `Email: ${rec.email}`,
      `Telefone: ${rec.telefone}`,
    ].join('\n');
    await handleCopy('all', block);
  };

  const handleExportCsv = () => {
    if (exportTargetRecords.length === 0) return;
    const csvContent = buildCsvPtBr(exportTargetRecords);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `empresas-cnpj-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportXlsx = async () => {
    if (exportTargetRecords.length === 0) return;
    setIsExportingXlsx(true);
    try {
      const res = await fetch('/api/export/xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: exportTargetRecords,
          fileName: `empresas-cnpj-${new Date().toISOString().slice(0, 10)}`,
        }),
      });
      if (!res.ok) throw new Error('Falha ao gerar arquivo Excel');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `empresas-cnpj-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingXlsx(false);
    }
  };

  const situacaoTextColor = (sit: string) => {
    const upper = sit.toUpperCase();
    if (upper === 'ATIVA') return 'text-[#34D399]';
    if (upper === 'BAIXADA' || upper === 'INAPTA' || upper === 'NULA') return 'text-[#F87171]';
    if (upper === 'SUSPENSA') return 'text-[#FBBF24]';
    return 'text-[#D1D5DB]';
  };

  const totalPages =
    totalApiResults && totalApiResults > 0 ? Math.ceil(totalApiResults / pageSize) : null;

  return (
    <section className="mt-5 bg-[#1B1C20] border border-[#2C2E35] rounded-md overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[#2C2E35] bg-[#1E1F24]">
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-[13px] font-medium text-[#E5E7EB]">
            <span className="font-mono-data font-semibold text-white">{records.length}</span>{' '}
            {records.length === 1 ? 'empresa extraída' : 'empresas extraídas'}
            {totalApiResults !== null && totalApiResults > records.length && (
              <span className="text-[#9CA3AF]">
                {' '}
                · Total na pesquisa:{' '}
                <span className="font-mono-data">{totalApiResults.toLocaleString('pt-BR')}</span>
              </span>
            )}
            {selectedCnpjs.size > 0 && (
              <span className="text-[#3B9AE8]">
                {' '}
                · <span className="font-mono-data">{selectedCnpjs.size}</span> selecionada(s)
              </span>
            )}
          </div>

          <div className="relative flex items-center bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] h-[34px] px-2.5 w-64">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] mr-2 shrink-0" />
            <input
              type="text"
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              placeholder="Filtrar resultados..."
              className="w-full bg-transparent text-[12px] text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedCnpjs.size > 0 && (
            <button
              type="button"
              onClick={onRemoveSelected}
              className="inline-flex items-center gap-1.5 bg-[#2A1C1E] hover:bg-[#3A2326] border border-[#5B2A30] text-[#FCA5A5] text-[12px] font-medium px-3 py-1.5 rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remover ({selectedCnpjs.size})</span>
            </button>
          )}

          {records.length > 0 && (
            <button
              type="button"
              onClick={onClearRecords}
              className="inline-flex items-center gap-1.5 bg-[#212227] hover:bg-[#2A2C33] border border-[#363840] text-[#D1D5DB] text-[12px] font-medium px-3 py-1.5 rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Limpar lista</span>
            </button>
          )}

          <button
            type="button"
            disabled={exportTargetRecords.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 bg-[#212227] hover:bg-[#2A2C33] disabled:opacity-40 border border-[#363840] text-[#E5E7EB] text-[12px] font-medium px-3.5 py-1.5 rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            disabled={exportTargetRecords.length === 0 || isExportingXlsx}
            onClick={handleExportXlsx}
            className="inline-flex items-center gap-1.5 bg-[#2EB872] hover:bg-[#27A364] disabled:opacity-40 text-white text-[12px] font-semibold px-4 py-1.5 rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>
              {isExportingXlsx
                ? 'Gerando Excel...'
                : `Exportar Excel (${exportTargetRecords.length})`}
            </span>
          </button>
        </div>
      </div>

      {/* Master-Detail Content */}
      {isLoading ? (
        <div className="p-6 space-y-2.5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-10 bg-[#212227] rounded animate-pulse border border-[#2C2E35]"
            />
          ))}
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="py-16 px-6 text-center">
          <FileSpreadsheet className="w-10 h-10 text-[#4B5563] mx-auto mb-3" />
          <p className="text-[14px] font-medium text-[#D1D5DB]">
            {records.length === 0
              ? 'Nenhuma empresa extraída ainda'
              : 'Nenhum resultado corresponde ao filtro rápido'}
          </p>
          <p className="text-[13px] text-[#9CA3AF] mt-1 max-w-lg mx-auto">
            {records.length === 0
              ? 'Preencha os filtros acima e clique em "Pesquisar", ou utilize a aba "Consulta em Lote (Gratuita)" para extrair os 8 campos estruturados e exportar para Excel.'
              : 'Limpe ou ajuste o texto do filtro rápido para visualizar todas as empresas extraídas.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col xl:flex-row">
          {/* Left: 8-column Data Table */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-[#16171B] border-b border-[#2C2E35] text-[11px] font-semibold text-[#9CA3AF] tracking-wide">
                  <th className="py-2.5 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={() => onToggleSelectAll(visibleCnpjs)}
                      aria-label="Selecionar todas as empresas visíveis"
                      className="rounded border-[#4B5563] bg-[#212227] text-[#2EB872] focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">CNPJ</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Razão Social</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Situação Cadastral</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Data da Situação</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Município</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Estado</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Email</th>
                  <th className="py-2.5 px-3 whitespace-nowrap pr-4">Telefone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#25272D] text-[12.5px]">
                {filteredRecords.map((rec) => {
                  const isActive = activeRecord?.cnpj === rec.cnpj;
                  const isChecked = selectedCnpjs.has(rec.cnpj);
                  return (
                    <tr
                      key={rec.cnpj}
                      onClick={() => setActiveCnpj(rec.cnpj)}
                      className={`h-[40px] cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-[#1A6FB3]/20'
                          : 'hover:bg-[#22242A]'
                      }`}
                    >
                      <td
                        className="py-2 pl-4 pr-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleSelect(rec.cnpj)}
                          aria-label={`Selecionar ${rec.razaoSocial}`}
                          className="rounded border-[#4B5563] bg-[#212227] text-[#2EB872] focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-3 font-mono-data text-[#E5E7EB] whitespace-nowrap">
                        {rec.cnpj}
                      </td>
                      <td className="py-2 px-3 text-white font-medium max-w-[260px] truncate" title={rec.razaoSocial}>
                        {rec.razaoSocial || '—'}
                      </td>
                      <td className={`py-2 px-3 font-semibold whitespace-nowrap ${situacaoTextColor(rec.situacaoCadastral)}`}>
                        {rec.situacaoCadastral || '—'}
                      </td>
                      <td className="py-2 px-3 font-mono-data text-[#D1D5DB] whitespace-nowrap">
                        {rec.dataSituacao || '—'}
                      </td>
                      <td className="py-2 px-3 text-[#D1D5DB] whitespace-nowrap">
                        {rec.municipio || '—'}
                      </td>
                      <td className="py-2 px-3 font-mono-data text-[#D1D5DB] whitespace-nowrap">
                        {rec.estado || '—'}
                      </td>
                      <td className="py-2 px-3 text-[#D1D5DB] max-w-[210px] truncate" title={rec.email}>
                        {rec.email || '—'}
                      </td>
                      <td className="py-2 px-3 pr-4 font-mono-data text-[#D1D5DB] whitespace-nowrap">
                        {rec.telefone || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* API Pagination if applicable */}
            {onPageChange && totalPages && totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#2C2E35] bg-[#16171B] text-[12px] text-[#9CA3AF]">
                <span>
                  Página <strong className="font-mono-data text-white">{currentPage}</strong> de{' '}
                  <strong className="font-mono-data text-white">{totalPages.toLocaleString('pt-BR')}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1 || isLoading}
                    onClick={() => onPageChange(currentPage - 1)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#212227] hover:bg-[#2A2C33] disabled:opacity-40 border border-[#363840] rounded text-[#E5E7EB] cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Anterior</span>
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages || isLoading}
                    onClick={() => onPageChange(currentPage + 1)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#212227] hover:bg-[#2A2C33] disabled:opacity-40 border border-[#363840] rounded text-[#E5E7EB] cursor-pointer"
                  >
                    <span>Próxima</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Detail Inspector (strictly the 8 requested fields) */}
          {activeRecord && (
            <aside className="w-full xl:w-[370px] shrink-0 border-t xl:border-t-0 xl:border-l border-[#2C2E35] bg-[#17181C] p-5">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#2C2E35]">
                <h3 className="text-[13px] font-semibold text-white">
                  Detalhes da Empresa
                </h3>
                <button
                  type="button"
                  onClick={() => handleCopyBlock(activeRecord)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-[#3B9AE8] hover:text-[#60B0F4] transition-colors cursor-pointer whitespace-nowrap"
                >
                  {copiedKey === 'all' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#2EB872]" />
                      <span className="text-[#2EB872]">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar tudo</span>
                    </>
                  )}
                </button>
              </div>

              <dl className="mt-4 space-y-3">
                {[
                  { key: 'cnpj', label: 'CNPJ', value: activeRecord.cnpj, mono: true },
                  { key: 'razaoSocial', label: 'Razão Social', value: activeRecord.razaoSocial, mono: false },
                  { key: 'situacaoCadastral', label: 'Situação Cadastral', value: activeRecord.situacaoCadastral, mono: false },
                  { key: 'dataSituacao', label: 'Data da Situação', value: activeRecord.dataSituacao, mono: true },
                  { key: 'municipio', label: 'Município', value: activeRecord.municipio, mono: false },
                  { key: 'estado', label: 'Estado', value: activeRecord.estado, mono: true },
                  { key: 'email', label: 'Email', value: activeRecord.email, mono: false },
                  { key: 'telefone', label: 'Telefone', value: activeRecord.telefone, mono: true },
                ].map((field) => (
                  <div
                    key={field.key}
                    className="group flex items-start justify-between gap-3 py-1.5 border-b border-[#23252B] last:border-b-0"
                  >
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium text-[#9CA3AF]">
                        {field.label}
                      </dt>
                      <dd
                        className={`mt-0.5 text-[13px] break-words ${
                          field.key === 'situacaoCadastral'
                            ? `font-semibold ${situacaoTextColor(field.value)}`
                            : 'text-[#F3F4F6]'
                        } ${field.mono ? 'font-mono-data' : ''}`}
                      >
                        {field.value || '—'}
                      </dd>
                    </div>
                    {field.value && (
                      <button
                        type="button"
                        onClick={() => handleCopy(field.key, field.value)}
                        title={`Copiar ${field.label}`}
                        className="opacity-60 group-hover:opacity-100 text-[#9CA3AF] hover:text-white p-1 rounded transition-opacity shrink-0 cursor-pointer"
                      >
                        {copiedKey === field.key ? (
                          <Check className="w-3.5 h-3.5 text-[#2EB872]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </dl>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
