export interface CompanyRecord {
  cnpj: string;
  razaoSocial: string;
  situacaoCadastral: string;
  dataSituacao: string;
  municipio: string;
  estado: string;
  email: string;
  telefone: string;
}

export interface AdvancedSearchFilters {
  termo: string;
  cnae: string;
  cnaeCodigo?: string;
  incluirAtividadeSecundaria: boolean;
  naturezaJuridica: string;
  naturezaCodigo?: string;
  situacaoCadastral: string[];
  ufs: string[];
  municipios: string[];
  bairros: string[];
  cep: string;
  ddd: string;
  dataAberturaInicio: string;
  dataAberturaFim: string;
  capitalSocialMin: string;
  capitalSocialMax: string;
  somenteMei: boolean;
  excluirMei: boolean;
  somenteMatriz: boolean;
  somenteFilial: boolean;
  comTelefone: boolean;
  somenteFixo: boolean;
  somenteCelular: boolean;
  comEmail: boolean;
  pagina: number;
  limite: number;
}

export interface SavedPreset {
  id: string;
  name: string;
  createdAt: string;
  filters: AdvancedSearchFilters;
}

export interface BrazilUf {
  sigla: string;
  nome: string;
}

export interface CnaeOption {
  codigo: string;
  descricao: string;
}

export interface NaturezaOption {
  codigo: string;
  descricao: string;
}

export const DEFAULT_FILTERS: AdvancedSearchFilters = {
  termo: '',
  cnae: '',
  cnaeCodigo: '',
  incluirAtividadeSecundaria: false,
  naturezaJuridica: '',
  naturezaCodigo: '',
  situacaoCadastral: ['ATIVA'],
  ufs: [],
  municipios: [],
  bairros: [],
  cep: '',
  ddd: '',
  dataAberturaInicio: '',
  dataAberturaFim: '',
  capitalSocialMin: '',
  capitalSocialMax: '',
  somenteMei: false,
  excluirMei: false,
  somenteMatriz: false,
  somenteFilial: false,
  comTelefone: false,
  somenteFixo: false,
  somenteCelular: false,
  comEmail: false,
  pagina: 1,
  limite: 20,
};

export const SITUACOES_CADASTRAIS = [
  'ATIVA',
  'BAIXADA',
  'INAPTA',
  'SUSPENSA',
  'NULA',
] as const;

export const BRAZIL_UFS: BrazilUf[] = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' },
];

export const NATUREZAS_JURIDICAS: NaturezaOption[] = [
  { codigo: '2062', descricao: 'Sociedade Empresária Limitada' },
  { codigo: '2135', descricao: 'Empresário (Individual)' },
  { codigo: '2305', descricao: 'Empresa Individual de Responsabilidade Limitada (EIRELI)' },
  { codigo: '2046', descricao: 'Sociedade Anônima Aberta' },
  { codigo: '2054', descricao: 'Sociedade Anônima Fechada' },
  { codigo: '2240', descricao: 'Sociedade Simples Limitada' },
  { codigo: '2232', descricao: 'Sociedade Simples Pura' },
  { codigo: '2143', descricao: 'Cooperativa' },
  { codigo: '3999', descricao: 'Associação Privada' },
  { codigo: '3069', descricao: 'Fundação Privada' },
  { codigo: '1015', descricao: 'Órgão Público do Poder Executivo Federal' },
  { codigo: '1023', descricao: 'Órgão Público do Poder Executivo Estadual ou do Distrito Federal' },
  { codigo: '1031', descricao: 'Órgão Público do Poder Executivo Municipal' },
  { codigo: '2321', descricao: 'Sociedade Unipessoal de Advogados' },
];

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCnpj(raw: string): string {
  const digits = onlyDigits(raw).padStart(14, '0').slice(0, 14);
  if (onlyDigits(raw).length === 0) return '';
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export function isValidCnpj(raw: string): boolean {
  const digits = onlyDigits(raw);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += Number(base[i]) * weights[i];
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(digits.slice(0, 12), w1);
  if (d1 !== Number(digits[12])) return false;
  const d2 = calcDigit(digits.slice(0, 13), w2);
  return d2 === Number(digits[13]);
}

export function extractCnpjsFromText(text: string): string[] {
  const matches = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\b\d{14}\b/g) || [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    const digits = onlyDigits(m);
    if (digits.length === 14 && !seen.has(digits) && isValidCnpj(digits)) {
      seen.add(digits);
      result.push(digits);
    }
  }
  return result;
}

export function formatDateBr(raw: unknown): string {
  if (!raw) return '';
  const str = String(raw).trim();
  if (!str) return '';

  // Already dd/MM/yyyy
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    return `${brMatch[1]}/${brMatch[2]}/${brMatch[3]}`;
  }

  // ISO yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  // Numeric yyyymmdd
  const compactMatch = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return `${compactMatch[3]}/${compactMatch[2]}/${compactMatch[1]}`;
  }

  return str;
}

const PT_PREPOSITIONS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'em']);

export function formatMunicipioTitleCase(raw: unknown): string {
  if (!raw) return '';
  const cleaned = String(raw)
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return '';

  return cleaned
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (index > 0 && PT_PREPOSITIONS.has(word)) {
        return word;
      }
      if (word.includes('-')) {
        return word
          .split('-')
          .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
          .join('-');
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function formatSituacaoCadastral(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const val = obj.situacao_atual ?? obj.descricao ?? obj.codigo ?? '';
    return formatSituacaoCadastral(val);
  }
  const str = String(raw).trim().toUpperCase();
  if (str === '2' || str === '02' || str.includes('ATIVA')) return 'ATIVA';
  if (str === '8' || str === '08' || str.includes('BAIXADA')) return 'BAIXADA';
  if (str === '4' || str === '04' || str.includes('INAPTA')) return 'INAPTA';
  if (str === '3' || str === '03' || str.includes('SUSPENSA')) return 'SUSPENSA';
  if (str === '1' || str === '01' || str.includes('NULA')) return 'NULA';
  return str;
}

export function formatSinglePhone(raw: string): string {
  let digits = onlyDigits(raw);
  if (!digits) return '';
  // Strip country code 55 if present on 12-13 digit number
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  // Remove leading 0 if 11 or 12 digits starting with 0
  if ((digits.length === 11 || digits.length === 12) && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return raw.trim();
}

export function formatPhoneList(values: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const formatted: string[] = [];

  for (const val of values) {
    if (!val) continue;
    const parts = String(val).split(/[/,;|]+/);
    for (const p of parts) {
      const clean = formatSinglePhone(p);
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        formatted.push(clean);
      }
    }
  }
  return formatted.join(' / ');
}

export function formatEmailList(values: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const val of values) {
    if (!val) continue;
    const parts = String(val).split(/[/,;\s|]+/);
    for (const p of parts) {
      const clean = p.trim().toLowerCase();
      if (clean && clean.includes('@') && !seen.has(clean)) {
        seen.add(clean);
        result.push(clean);
      }
    }
  }
  return result.join(', ');
}

export function cleanRazaoSocial(raw: unknown): string {
  if (!raw) return '';
  return String(raw).trim().replace(/\s+/g, ' ');
}

export function normalizeRawCompany(raw: Record<string, unknown>): CompanyRecord {
  const est =
    typeof raw.estabelecimento === 'object' && raw.estabelecimento !== null
      ? (raw.estabelecimento as Record<string, unknown>)
      : null;

  const cnpjRaw = String(est?.cnpj ?? raw.cnpj ?? raw.ni ?? '');
  const razaoRaw = raw.razao_social ?? raw.razaoSocial ?? raw.nome ?? '';

  const sitObj =
    typeof raw.situacao_cadastral === 'object' && raw.situacao_cadastral !== null
      ? (raw.situacao_cadastral as Record<string, unknown>)
      : null;

  const situacaoRaw =
    sitObj?.situacao_atual ??
    est?.situacao_cadastral ??
    raw.descricao_situacao_cadastral ??
    raw.situacao_cadastral ??
    raw.situacao ??
    raw.situacaoCadastral ??
    '';

  const dataSitRaw =
    sitObj?.data ??
    est?.data_situacao_cadastral ??
    raw.data_situacao_cadastral ??
    raw.dataSituacao ??
    raw.data_situacao ??
    '';

  const endereco =
    typeof raw.endereco === 'object' && raw.endereco !== null
      ? (raw.endereco as Record<string, unknown>)
      : null;

  const estCidade =
    est && typeof est.cidade === 'object' && est.cidade !== null
      ? (est.cidade as Record<string, unknown>).nome
      : undefined;
  const estEstado =
    est && typeof est.estado === 'object' && est.estado !== null
      ? (est.estado as Record<string, unknown>).sigla
      : undefined;

  const municipioRaw =
    endereco?.municipio ??
    estCidade ??
    raw.municipio ??
    (typeof raw.cidade === 'string' ? raw.cidade : '') ??
    '';

  const ufRaw = endereco?.uf ?? estEstado ?? raw.uf ?? raw.estado ?? '';

  // Emails from Casa dos Dados v5/v4, BrasilAPI, MinhaReceita, OpenCNPJ, CNPJ.ws
  const emailCandidates: Array<string | null | undefined> = [];
  if (Array.isArray(raw.contato_email)) {
    for (const item of raw.contato_email) {
      if (typeof item === 'string') emailCandidates.push(item);
      else if (item && typeof item === 'object') {
        emailCandidates.push(String((item as Record<string, unknown>).email ?? ''));
      }
    }
  }
  if (typeof est?.email === 'string') emailCandidates.push(est.email);
  if (typeof raw.email === 'string') emailCandidates.push(raw.email);
  if (typeof raw.correio_eletronico === 'string') emailCandidates.push(raw.correio_eletronico);

  // Phones from Casa dos Dados v5/v4, BrasilAPI, MinhaReceita, OpenCNPJ, CNPJ.ws
  const phoneCandidates: Array<string | null | undefined> = [];
  if (Array.isArray(raw.contato_telefonico)) {
    for (const item of raw.contato_telefonico) {
      if (typeof item === 'string') {
        phoneCandidates.push(item);
      } else if (item && typeof item === 'object') {
        const t = item as Record<string, unknown>;
        if (t.completo) phoneCandidates.push(String(t.completo));
        else if (t.ddd || t.numero) phoneCandidates.push(`${t.ddd ?? ''}${t.numero ?? ''}`);
      }
    }
  }
  if (Array.isArray(raw.telefones)) {
    for (const item of raw.telefones) {
      if (typeof item === 'string') {
        phoneCandidates.push(item);
      } else if (item && typeof item === 'object') {
        const t = item as Record<string, unknown>;
        if (t.ddd || t.numero) phoneCandidates.push(`${t.ddd ?? ''}${t.numero ?? ''}`);
      }
    }
  }
  if (typeof est?.ddd1 === 'string' && typeof est?.telefone1 === 'string') {
    phoneCandidates.push(`${est.ddd1}${est.telefone1}`);
  }
  if (typeof est?.ddd2 === 'string' && typeof est?.telefone2 === 'string') {
    phoneCandidates.push(`${est.ddd2}${est.telefone2}`);
  }
  if (typeof raw.ddd_telefone_1 === 'string') phoneCandidates.push(raw.ddd_telefone_1);
  if (typeof raw.ddd_telefone_2 === 'string') phoneCandidates.push(raw.ddd_telefone_2);
  if (typeof raw.telefone === 'string') phoneCandidates.push(raw.telefone);
  if (typeof raw.telefone_1 === 'string') phoneCandidates.push(raw.telefone_1);
  if (typeof raw.telefone_2 === 'string') phoneCandidates.push(raw.telefone_2);
  if (typeof raw.ddd_1 === 'string' && typeof raw.telefone_1 === 'string') {
    phoneCandidates.push(`${raw.ddd_1}${raw.telefone_1}`);
  }
  if (typeof raw.ddd_2 === 'string' && typeof raw.telefone_2 === 'string') {
    phoneCandidates.push(`${raw.ddd_2}${raw.telefone_2}`);
  }

  return {
    cnpj: formatCnpj(cnpjRaw),
    razaoSocial: cleanRazaoSocial(razaoRaw),
    situacaoCadastral: formatSituacaoCadastral(situacaoRaw),
    dataSituacao: formatDateBr(dataSitRaw),
    municipio: formatMunicipioTitleCase(municipioRaw),
    estado: String(ufRaw).trim().toUpperCase().slice(0, 2),
    email: formatEmailList(emailCandidates),
    telefone: formatPhoneList(phoneCandidates),
  };
}

export function buildCsvPtBr(records: CompanyRecord[]): string {
  const headers = [
    'CNPJ',
    'Razão Social',
    'Situação Cadastral',
    'Data da Situação',
    'Município',
    'Estado',
    'Email',
    'Telefone',
  ];

  const escapeCsv = (val: string) => {
    const clean = (val ?? '').replace(/\r?\n/g, ' ').trim();
    if (clean.includes(';') || clean.includes('"') || clean.includes('\n')) {
      return `"${clean.replace(/"/g, '""')}"`;
    }
    return clean;
  };

  const rows = records.map((r) =>
    [
      r.cnpj,
      r.razaoSocial,
      r.situacaoCadastral,
      r.dataSituacao,
      r.municipio,
      r.estado,
      r.email,
      r.telefone,
    ]
      .map(escapeCsv)
      .join(';')
  );

  // UTF-8 BOM + semicolon separator for instant Portuguese Excel compatibility
  return '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
}
