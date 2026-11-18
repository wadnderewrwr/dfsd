import React, { useEffect, useRef, useState } from 'react';
import { Calendar, Home, Info, Phone, Tag, X, RotateCcw } from 'lucide-react';
import {
  BRAZIL_UFS,
  NATUREZAS_JURIDICAS,
  SITUACOES_CADASTRAIS,
  type AdvancedSearchFilters,
  type CnaeOption,
  onlyDigits,
} from '../shared/cnpj';

interface MunicipioOption {
  id: number;
  nome: string;
  uf: string;
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  amberActive?: boolean;
}

function ToggleSwitch({ checked, onChange, label, amberActive = false }: ToggleSwitchProps) {
  const trackBg = checked
    ? amberActive
      ? 'bg-[#7A5708] border-[#9A6F0C]'
      : 'bg-[#2EB872] border-[#2EB872]'
    : 'bg-[#35373E] border-[#444750]';

  const thumbBg = checked
    ? amberActive
      ? 'bg-[#D99B16]'
      : 'bg-white'
    : 'bg-[#7D818C]';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2585D6] rounded"
    >
      <span
        className={`relative inline-flex h-[20px] w-[38px] shrink-0 items-center rounded-[4px] border transition-colors duration-150 ${trackBg}`}
      >
        <span
          className={`inline-block h-[14px] w-[16px] rounded-[2px] transition-transform duration-150 ${thumbBg} ${
            checked ? 'translate-x-[19px]' : 'translate-x-[2px]'
          }`}
        />
      </span>
      <span className="text-[13px] font-medium text-[#D1D5DB] group-hover:text-white transition-colors select-none whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}

interface AdvancedSearchPanelProps {
  filters: AdvancedSearchFilters;
  onChange: (next: AdvancedSearchFilters) => void;
  onSearch: () => void;
  onOpenSaveShare: () => void;
  onReset: () => void;
  isSearching: boolean;
}

export function AdvancedSearchPanel({
  filters,
  onChange,
  onSearch,
  onOpenSaveShare,
  onReset,
  isSearching,
}: AdvancedSearchPanelProps) {
  // Autocomplete states
  const [ufQuery, setUfQuery] = useState('');
  const [ufDropdownOpen, setUfDropdownOpen] = useState(false);

  const [municipioQuery, setMunicipioQuery] = useState('');
  const [municipioOptions, setMunicipioOptions] = useState<MunicipioOption[]>([]);
  const [municipioDropdownOpen, setMunicipioDropdownOpen] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);

  const [bairroInput, setBairroInput] = useState('');

  const [cnaeOptions, setCnaeOptions] = useState<CnaeOption[]>([]);
  const [cnaeDropdownOpen, setCnaeDropdownOpen] = useState(false);

  const [naturezaDropdownOpen, setNaturezaDropdownOpen] = useState(false);

  const ufRef = useRef<HTMLDivElement>(null);
  const munRef = useRef<HTMLDivElement>(null);
  const cnaeRef = useRef<HTMLDivElement>(null);
  const natRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ufRef.current && !ufRef.current.contains(e.target as Node)) setUfDropdownOpen(false);
      if (munRef.current && !munRef.current.contains(e.target as Node)) setMunicipioDropdownOpen(false);
      if (cnaeRef.current && !cnaeRef.current.contains(e.target as Node)) setCnaeDropdownOpen(false);
      if (natRef.current && !natRef.current.contains(e.target as Node)) setNaturezaDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load IBGE municipalities whenever selected UFs change
  useEffect(() => {
    let active = true;
    async function loadMunicipios() {
      if (filters.ufs.length === 0) {
        setMunicipioOptions([]);
        return;
      }
      setLoadingMunicipios(true);
      try {
        const all: MunicipioOption[] = [];
        await Promise.all(
          filters.ufs.map(async (uf) => {
            const res = await fetch(`/api/ibge/municipios/${uf}`);
            if (res.ok) {
              const items = (await res.json()) as MunicipioOption[];
              all.push(...items);
            }
          })
        );
        if (active) {
          all.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
          setMunicipioOptions(all);
        }
      } catch {
        if (active) setMunicipioOptions([]);
      } finally {
        if (active) setLoadingMunicipios(false);
      }
    }
    loadMunicipios();
    return () => {
      active = false;
    };
  }, [filters.ufs]);

  // Debounced IBGE CNAE lookup
  useEffect(() => {
    if (!cnaeDropdownOpen) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ibge/cnaes?q=${encodeURIComponent(filters.cnae)}`);
        if (res.ok) {
          const data = (await res.json()) as CnaeOption[];
          setCnaeOptions(data);
        }
      } catch {
        setCnaeOptions([]);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [filters.cnae, cnaeDropdownOpen]);

  const update = (patch: Partial<AdvancedSearchFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const toggleSituacao = (sit: string) => {
    const exists = filters.situacaoCadastral.includes(sit);
    const next = exists
      ? filters.situacaoCadastral.filter((s) => s !== sit)
      : [...filters.situacaoCadastral, sit];
    update({ situacaoCadastral: next.length > 0 ? next : [sit] });
  };

  const addUf = (sigla: string) => {
    if (!filters.ufs.includes(sigla)) {
      update({ ufs: [...filters.ufs, sigla] });
    }
    setUfQuery('');
    setUfDropdownOpen(false);
  };

  const removeUf = (sigla: string) => {
    update({
      ufs: filters.ufs.filter((u) => u !== sigla),
      municipios: filters.municipios.filter((m) => !m.endsWith(`- ${sigla}`)),
    });
  };

  const addMunicipio = (label: string) => {
    const normalized = label.trim().toUpperCase();
    if (normalized && !filters.municipios.includes(normalized)) {
      update({ municipios: [...filters.municipios, normalized] });
    }
    setMunicipioQuery('');
    setMunicipioDropdownOpen(false);
  };

  const removeMunicipio = (label: string) => {
    update({ municipios: filters.municipios.filter((m) => m !== label) });
  };

  const addBairro = (val: string) => {
    const clean = val.trim();
    if (clean && !filters.bairros.includes(clean)) {
      update({ bairros: [...filters.bairros, clean] });
    }
    setBairroInput('');
  };

  const removeBairro = (val: string) => {
    update({ bairros: filters.bairros.filter((b) => b !== val) });
  };

  const filteredUfs = BRAZIL_UFS.filter(
    (u) =>
      !filters.ufs.includes(u.sigla) &&
      (u.nome.toLowerCase().includes(ufQuery.toLowerCase()) ||
        u.sigla.toLowerCase().includes(ufQuery.toLowerCase()))
  );

  const filteredMunicipios = municipioOptions
    .filter((m) => {
      const label = `${m.nome} - ${m.uf}`;
      if (filters.municipios.includes(label)) return false;
      if (!municipioQuery.trim()) return true;
      return label.toLowerCase().includes(municipioQuery.trim().toLowerCase());
    })
    .slice(0, 40);

  const filteredNaturezas = NATUREZAS_JURIDICAS.filter((n) => {
    const q = filters.naturezaJuridica.toLowerCase().trim();
    if (!q) return true;
    return n.codigo.includes(q) || n.descricao.toLowerCase().includes(q);
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Commit pending bairro input if user typed without pressing Enter
    if (bairroInput.trim()) {
      const clean = bairroInput.trim();
      if (!filters.bairros.includes(clean)) {
        onChange({ ...filters, bairros: [...filters.bairros, clean], pagina: 1 });
      }
      setBairroInput('');
    }
    onSearch();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#1B1C20] border border-[#2C2E35] rounded-md px-6 py-5"
    >
      {/* ROW 1: Razão Social / CNAE / Natureza Jurídica */}
      <div className="grid grid-cols-12 gap-5">
        {/* Razão Social ou Nome Fantasia */}
        <div className="col-span-12 lg:col-span-3">
          <label className="block text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            Razão Social ou Nome Fantasia
          </label>
          <div className="relative flex items-center bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] h-[38px] px-2.5 transition-colors">
            <Tag className="w-3.5 h-3.5 text-[#D1D5DB] shrink-0 mr-2" />
            <input
              type="text"
              value={filters.termo}
              onChange={(e) => update({ termo: e.target.value })}
              placeholder="Razão Social ou Fantasia"
              className="w-full bg-transparent text-[13px] text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none"
            />
          </div>
        </div>

        {/* Atividade Principal (CNAE) + Toggle */}
        <div className="col-span-12 lg:col-span-5" ref={cnaeRef}>
          <label className="block text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            Atividade Principal (CNAE)
          </label>
          <div className="relative">
            <div className="flex items-center bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] h-[38px] px-2.5 transition-colors">
              <Tag className="w-3.5 h-3.5 text-[#D1D5DB] shrink-0 mr-2" />
              <input
                type="text"
                value={filters.cnae}
                onFocus={() => setCnaeDropdownOpen(true)}
                onChange={(e) => {
                  update({ cnae: e.target.value, cnaeCodigo: '' });
                  setCnaeDropdownOpen(true);
                }}
                placeholder="Código ou nome da atividade"
                className="w-full bg-transparent text-[13px] text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none"
              />
              {filters.cnae && (
                <button
                  type="button"
                  onClick={() => update({ cnae: '', cnaeCodigo: '' })}
                  className="text-[#9CA3AF] hover:text-white ml-1"
                  aria-label="Limpar CNAE"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {cnaeDropdownOpen && cnaeOptions.length > 0 && (
              <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-[#212227] border border-[#3B3E47] rounded-[4px] shadow-xl">
                {cnaeOptions.map((item) => (
                  <button
                    key={item.codigo}
                    type="button"
                    onClick={() => {
                      update({
                        cnae: `${item.codigo} - ${item.descricao}`,
                        cnaeCodigo: item.codigo,
                      });
                      setCnaeDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[12px] text-[#E5E7EB] hover:bg-[#2B2E36] border-b border-[#2C2E35] last:border-b-0 flex items-start gap-2"
                  >
                    <span className="font-mono-data text-[#3B9AE8] shrink-0">{item.codigo}</span>
                    <span className="line-clamp-2">{item.descricao}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2.5">
            <ToggleSwitch
              checked={filters.incluirAtividadeSecundaria}
              onChange={(val) => update({ incluirAtividadeSecundaria: val })}
              label="Incluir Atividade Secundária"
            />
          </div>
        </div>

        {/* Natureza Jurídica */}
        <div className="col-span-12 lg:col-span-4" ref={natRef}>
          <label className="block text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            Natureza Jurídica
          </label>
          <div className="relative">
            <div className="flex items-center bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] h-[38px] px-2.5 transition-colors">
              <Tag className="w-3.5 h-3.5 text-[#D1D5DB] shrink-0 mr-2" />
              <input
                type="text"
                value={filters.naturezaJuridica}
                onFocus={() => setNaturezaDropdownOpen(true)}
                onChange={(e) => {
                  update({ naturezaJuridica: e.target.value, naturezaCodigo: '' });
                  setNaturezaDropdownOpen(true);
                }}
                placeholder="Código ou nome da natureza"
                className="w-full bg-transparent text-[13px] text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none"
              />
              {filters.naturezaJuridica && (
                <button
                  type="button"
                  onClick={() => update({ naturezaJuridica: '', naturezaCodigo: '' })}
                  className="text-[#9CA3AF] hover:text-white ml-1"
                  aria-label="Limpar Natureza Jurídica"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {naturezaDropdownOpen && filteredNaturezas.length > 0 && (
              <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-[#212227] border border-[#3B3E47] rounded-[4px] shadow-xl">
                {filteredNaturezas.map((item) => (
                  <button
                    key={item.codigo}
                    type="button"
                    onClick={() => {
                      update({
                        naturezaJuridica: `${item.codigo} - ${item.descricao}`,
                        naturezaCodigo: item.codigo,
                      });
                      setNaturezaDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[12px] text-[#E5E7EB] hover:bg-[#2B2E36] border-b border-[#2C2E35] last:border-b-0 flex items-start gap-2"
                  >
                    <span className="font-mono-data text-[#3B9AE8] shrink-0">{item.codigo}</span>
                    <span>{item.descricao}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 2: Situação Cadastral / Estado (UF) / Município / Bairro / CEP */}
      <div className="grid grid-cols-12 gap-5 mt-5 items-start">
        {/* Situação Cadastral (vertical listbox like screenshot) */}
        <div className="col-span-12 md:col-span-4 lg:col-span-2">
          <label className="block text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            Situação Cadastral
          </label>
          <div
            role="listbox"
            aria-label="Situação Cadastral"
            aria-multiselectable="true"
            className="bg-[#212227] border border-[#363840] rounded-[4px] h-[106px] overflow-y-auto select-none"
          >
            {SITUACOES_CADASTRAIS.map((sit) => {
              const selected = filters.situacaoCadastral.includes(sit);
              return (
                <button
                  key={sit}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggleSituacao(sit)}
                  className={`w-full text-left px-2.5 py-[5px] text-[12px] font-medium transition-colors block ${
                    selected
                      ? 'bg-[#6B7280] text-white'
                      : 'text-[#D1D5DB] hover:bg-[#2B2E36]'
                  }`}
                >
                  {sit}
                </button>
              );
            })}
          </div>
        </div>

        {/* Estado (UF) */}
        <div className="col-span-12 md:col-span-8 lg:col-span-3" ref={ufRef}>
          <label className="block text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            Estado (UF)
          </label>
          <div className="relative">
            <div
              onClick={() => setUfDropdownOpen(true)}
              className="flex flex-wrap items-center gap-1.5 bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] min-h-[38px] px-2 py-1 cursor-text transition-colors"
            >
              {filters.ufs.map((sigla) => {
                const ufObj = BRAZIL_UFS.find((u) => u.sigla === sigla);
                return (
                  <span
                    key={sigla}
                    className="inline-flex items-center gap-1 bg-[#1A6FB3] text-white text-[12px] font-medium px-2 py-0.5 rounded-[3px] whitespace-nowrap"
                  >
                    {ufObj ? ufObj.nome : sigla}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeUf(sigla);
                      }}
                      className="text-white/80 hover:text-white"
                      aria-label={`Remover ${sigla}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
              <Home className="w-3.5 h-3.5 text-[#D1D5DB] shrink-0 mx-0.5" />
              <input
                type="text"
                value={ufQuery}
                onFocus={() => setUfDropdownOpen(true)}
                onChange={(e) => {
                  setUfQuery(e.target.value);
                  setUfDropdownOpen(true);
                }}
                placeholder="Selecione o estado"
                className="flex-1 min-w-[90px] bg-transparent text-[13px] text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none"
              />
            </div>

            {ufDropdownOpen && filteredUfs.length > 0 && (
              <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-[#212227] border border-[#3B3E47] rounded-[4px] shadow-xl">
                {filteredUfs.map((u) => (
                  <button
                    key={u.sigla}
                    type="button"
                    onClick={() => addUf(u.sigla)}
                    className="w-full text-left px-3 py-1.5 text-[12px] text-[#E5E7EB] hover:bg-[#2B2E36] flex items-center justify-between"
                  >
                    <span>{u.nome}</span>
                    <span className="font-mono-data text-[#9CA3AF]">{u.sigla}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Município */}
        <div className="col-span-12 md:col-span-6 lg:col-span-3" ref={munRef}>
          <label className="flex items-center gap-1.5 text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            <span>Município</span>
            <span
              title="Selecione um Estado (UF) primeiro para carregar os municípios do IBGE, ou digite e pressione Enter."
              className="text-[#D1D5DB] cursor-help"
            >
              <Info className="w-3.5 h-3.5" />
            </span>
          </label>
          <div className="relative">
            <div
              onClick={() => setMunicipioDropdownOpen(true)}
              className="flex flex-wrap items-center gap-1.5 bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] min-h-[38px] px-2 py-1 cursor-text transition-colors"
            >
              {filters.municipios.map((mun) => (
                <span
                  key={mun}
                  className="inline-flex items-center gap-1 bg-[#1A6FB3] text-white text-[12px] font-medium px-2 py-0.5 rounded-[3px] whitespace-nowrap"
                >
                  {mun}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMunicipio(mun);
                    }}
                    className="text-white/80 hover:text-white"
                    aria-label={`Remover ${mun}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <Home className="w-3.5 h-3.5 text-[#D1D5DB] shrink-0 mx-0.5" />
              <input
                type="text"
                value={municipioQuery}
                onFocus={() => setMunicipioDropdownOpen(true)}
                onChange={(e) => {
                  setMunicipioQuery(e.target.value);
                  setMunicipioDropdownOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && municipioQuery.trim()) {
                    e.preventDefault();
                    addMunicipio(municipioQuery);
                  }
                }}
                placeholder="Selecione um município"
                className="flex-1 min-w-[90px] bg-transparent text-[13px] text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none"
              />
            </div>

            {municipioDropdownOpen && (
              <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-[#212227] border border-[#3B3E47] rounded-[4px] shadow-xl">
                {loadingMunicipios ? (
                  <div className="px-3 py-2 text-[12px] text-[#9CA3AF]">
                    Carregando municípios do IBGE...
                  </div>
                ) : filteredMunicipios.length > 0 ? (
                  filteredMunicipios.map((m) => {
                    const label = `${m.nome} - ${m.uf}`;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => addMunicipio(label)}
                        className="w-full text-left px-3 py-1.5 text-[12px] text-[#E5E7EB] hover:bg-[#2B2E36]"
                      >
                        {label}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-[12px] text-[#9CA3AF]">
                    {filters.ufs.length === 0
                      ? 'Selecione um Estado (UF) ao lado ou digite e pressione Enter.'
                      : 'Nenhum município encontrado.'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bairro */}
        <div className="col-span-12 md:col-span-6 lg:col-span-2">
          <label className="flex items-center gap-1.5 text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            <span>Bairro</span>
            <span
              title="Digite o nome do bairro e pressione Enter para adicionar múltiplos bairros."
              className="text-[#D1D5DB] cursor-help"
            >
              <Info className="w-3.5 h-3.5" />
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-1.5 bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] min-h-[38px] px-2 py-1 transition-colors">
            {filters.bairros.map((b) => (
              <span
                key={b}
                className="inline-flex items-center gap-1 bg-[#1A6FB3] text-white text-[12px] font-medium px-2 py-0.5 rounded-[3px] whitespace-nowrap"
              >
                {b}
                <button
                  type="button"
                  onClick={() => removeBairro(b)}
                  className="text-white/80 hover:text-white"
                  aria-label={`Remover ${b}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <Home className="w-3.5 h-3.5 text-[#D1D5DB] shrink-0 mx-0.5" />
            <input
              type="text"
              value={bairroInput}
              onChange={(e) => setBairroInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && bairroInput.trim()) {
                  e.preventDefault();
                  addBairro(bairroInput);
                }
              }}
              placeholder="Digite o nome do bairro"
              className="flex-1 min-w-[80px] bg-transparent text-[13px] text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none"
            />
          </div>
        </div>

        {/* CEP */}
        <div className="col-span-12 md:col-span-6 lg:col-span-2">
          <label className="block text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            CEP
          </label>
          <div className="flex items-center bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] h-[38px] px-2.5 transition-colors">
            <Home className="w-3.5 h-3.5 text-[#D1D5DB] shrink-0 mr-2" />
            <input
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={filters.cep}
              onChange={(e) => update({ cep: onlyDigits(e.target.value).slice(0, 8) })}
              placeholder="Somente 8 dígitos"
              className="w-full bg-transparent font-mono-data text-[13px] text-[#E5E7EB] placeholder-[#6B7280] placeholder:font-sans focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ROW 3: DDD / Data Abertura Inicio / Data Abertura Fim / Capital Social Min / Capital Social Max */}
      <div className="grid grid-cols-12 gap-5 mt-5">
        {/* DDD */}
        <div className="col-span-12 md:col-span-4 lg:col-span-2">
          <label className="block text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            DDD
          </label>
          <div className="flex items-center bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] h-[38px] px-2.5 transition-colors">
            <Phone className="w-3.5 h-3.5 text-[#D1D5DB] shrink-0 mr-2" />
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={filters.ddd}
              onChange={(e) => update({ ddd: onlyDigits(e.target.value).slice(0, 2) })}
              placeholder="2 dígitos"
              className="w-full bg-transparent font-mono-data text-[13px] text-[#E5E7EB] placeholder-[#6B7280] placeholder:font-sans focus:outline-none"
            />
          </div>
        </div>

        {/* Data de Abertura - A partir de */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3">
          <label className="block text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            Data de Abertura - A partir de
          </label>
          <div className="flex items-center bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] h-[38px] px-2.5 transition-colors">
            <Calendar className="w-3.5 h-3.5 text-[#D1D5DB] shrink-0 mr-2" />
            <input
              type="date"
              value={filters.dataAberturaInicio}
              onChange={(e) => update({ dataAberturaInicio: e.target.value })}
              className="w-full bg-transparent font-mono-data text-[13px] text-[#E5E7EB] focus:outline-none"
            />
          </div>
        </div>

        {/* Data de Abertura - Até */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3">
          <label className="block text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            Data de Abertura - Até
          </label>
          <div className="flex items-center bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] h-[38px] px-2.5 transition-colors">
            <Calendar className="w-3.5 h-3.5 text-[#D1D5DB] shrink-0 mr-2" />
            <input
              type="date"
              value={filters.dataAberturaFim}
              onChange={(e) => update({ dataAberturaFim: e.target.value })}
              className="w-full bg-transparent font-mono-data text-[13px] text-[#E5E7EB] focus:outline-none"
            />
          </div>
        </div>

        {/* Capital Social - A partir de */}
        <div className="col-span-12 md:col-span-6 lg:col-span-2">
          <label className="block text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            Capital Social
          </label>
          <div className="flex items-center bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] h-[38px] px-2.5 transition-colors">
            <input
              type="text"
              inputMode="numeric"
              value={filters.capitalSocialMin}
              onChange={(e) => update({ capitalSocialMin: onlyDigits(e.target.value) })}
              placeholder="A partir de"
              className="w-full bg-transparent font-mono-data text-[13px] text-[#E5E7EB] placeholder-[#6B7280] placeholder:font-sans focus:outline-none"
            />
          </div>
        </div>

        {/* Capital Social - Até */}
        <div className="col-span-12 md:col-span-6 lg:col-span-2">
          <label className="block text-[13px] font-semibold text-[#E5E7EB] mb-1.5">
            Capital Social
          </label>
          <div className="flex items-center bg-[#212227] border border-[#363840] focus-within:border-[#2585D6] rounded-[4px] h-[38px] px-2.5 transition-colors">
            <input
              type="text"
              inputMode="numeric"
              value={filters.capitalSocialMax}
              onChange={(e) => update({ capitalSocialMax: onlyDigits(e.target.value) })}
              placeholder="Até"
              className="w-full bg-transparent font-mono-data text-[13px] text-[#E5E7EB] placeholder-[#6B7280] placeholder:font-sans focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ROW 4: Toggles (2 groups matching screenshot) */}
      <div className="mt-6 flex flex-wrap items-start gap-x-14 gap-y-3">
        {/* Left group: MEI & Matriz/Filial */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
          <ToggleSwitch
            checked={filters.somenteMei}
            onChange={(val) => update({ somenteMei: val, excluirMei: val ? false : filters.excluirMei })}
            label="Somente MEI"
          />
          <ToggleSwitch
            checked={filters.excluirMei}
            onChange={(val) => update({ excluirMei: val, somenteMei: val ? false : filters.somenteMei })}
            label="Excluir MEI"
          />
          <ToggleSwitch
            checked={filters.somenteMatriz}
            onChange={(val) => update({ somenteMatriz: val, somenteFilial: val ? false : filters.somenteFilial })}
            label="Somente matriz"
          />
          <ToggleSwitch
            checked={filters.somenteFilial}
            onChange={(val) => update({ somenteFilial: val, somenteMatriz: val ? false : filters.somenteMatriz })}
            label="Somente filial"
          />
        </div>

        {/* Right group: Telefone, Fixo, Celular (amber), Email (amber) */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
          <ToggleSwitch
            checked={filters.comTelefone}
            onChange={(val) => update({ comTelefone: val })}
            label="Com contato de telefone"
          />
          <ToggleSwitch
            checked={filters.somenteFixo}
            onChange={(val) => update({ somenteFixo: val, somenteCelular: val ? false : filters.somenteCelular })}
            label="Somente fixo"
          />
          <ToggleSwitch
            checked={filters.somenteCelular}
            onChange={(val) => update({ somenteCelular: val, somenteFixo: val ? false : filters.somenteFixo })}
            label="Somente celular"
            amberActive
          />
          <ToggleSwitch
            checked={filters.comEmail}
            onChange={(val) => update({ comEmail: val })}
            label="Com e-mail"
            amberActive
          />
        </div>
      </div>

      {/* ROW 5: Pesquisar (Green) + Salvar ou Compartilhar (Blue Outline) + Limpar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSearching}
            className="bg-[#2EB872] hover:bg-[#27A364] disabled:opacity-60 text-white font-semibold text-[14px] px-6 py-2.5 rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
          >
            {isSearching ? 'Pesquisando...' : 'Pesquisar'}
          </button>

          <button
            type="button"
            onClick={onOpenSaveShare}
            className="bg-transparent hover:bg-[#1A6FB3]/15 border border-[#1E60A6] text-[#2B8CEE] font-medium text-[14px] px-5 py-2.5 rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
          >
            Salvar ou Compartilhar
          </button>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-[13px] text-[#9CA3AF] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Limpar filtros</span>
        </button>
      </div>
    </form>
  );
}
