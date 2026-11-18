import React, { useState } from 'react';
import { Check, KeyRound, X } from 'lucide-react';

interface ApiSettingsModalProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  apiUrl: string;
  enrichMissing: boolean;
  onSave: (next: { apiKey: string; apiUrl: string; enrichMissing: boolean }) => void;
}

export function ApiSettingsModal({
  open,
  onClose,
  apiKey,
  apiUrl,
  enrichMissing,
  onSave,
}: ApiSettingsModalProps) {
  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftUrl, setDraftUrl] = useState(
    apiUrl || 'https://api.casadosdados.com.br/v5/cnpj/pesquisa'
  );
  const [draftEnrich, setDraftEnrich] = useState(enrichMissing);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!open) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': draftKey.trim(),
          'x-api-url': draftUrl.trim(),
        },
        body: JSON.stringify({ apiKey: draftKey.trim(), apiUrl: draftUrl.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (res.ok && data.ok) {
        setTestResult({ ok: true, message: 'Conexão validada com sucesso na API Casa dos Dados.' });
      } else {
        setTestResult({ ok: false, message: data.error || 'Chave recusada pela API.' });
      }
    } catch {
      setTestResult({ ok: false, message: 'Erro de rede ao testar conexão.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      apiKey: draftKey.trim(),
      apiUrl: draftUrl.trim() || 'https://api.casadosdados.com.br/v5/cnpj/pesquisa',
      enrichMissing: draftEnrich,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg bg-[#1B1C20] border border-[#32343C] rounded-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2C2E35]">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#2EB872]" />
            <h2 className="text-[15px] font-semibold text-white">
              Configuração da API Casa dos Dados
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-white p-1 rounded cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-[#E5E7EB] mb-1.5">
              API Key (Casa dos Dados v5/v4)
            </label>
            <input
              type="password"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="Cole aqui sua api-key da Casa dos Dados"
              className="w-full bg-[#212227] border border-[#363840] focus:border-[#2585D6] rounded-[4px] h-[38px] px-3 font-mono-data text-[13px] text-white placeholder-[#6B7280] placeholder:font-sans focus:outline-none"
            />
            <p className="text-[12px] text-[#9CA3AF] mt-1.5">
              A chave fica salva apenas localmente no seu navegador e é usada somente nas consultas enviadas ao servidor proxy. Sem chave, você ainda pode usar a aba Consulta em Lote (Gratuita).
            </p>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[#E5E7EB] mb-1.5">
              Endpoint de Pesquisa Avançada
            </label>
            <input
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              className="w-full bg-[#212227] border border-[#363840] focus:border-[#2585D6] rounded-[4px] h-[38px] px-3 font-mono-data text-[12px] text-[#D1D5DB] focus:outline-none"
            />
          </div>

          <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={draftEnrich}
              onChange={(e) => setDraftEnrich(e.target.checked)}
              className="mt-0.5 rounded border-[#4B5563] bg-[#212227] text-[#2EB872] focus:ring-0"
            />
            <span className="text-[12.5px] text-[#D1D5DB]">
              Enriquecer automaticamente <strong className="text-white">Email, Telefone e Data da Situação</strong> caso a pesquisa resumida retorne campos em branco.
            </span>
          </label>

          {testResult && (
            <div
              className={`text-[12.5px] px-3 py-2 rounded-[4px] border ${
                testResult.ok
                  ? 'bg-[#172B21] border-[#255C40] text-[#6EE7B7]'
                  : 'bg-[#2A1C1E] border-[#5B2A30] text-[#FCA5A5]'
              }`}
            >
              {testResult.message}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-[#2C2E35]">
            <button
              type="button"
              disabled={!draftKey.trim() || testing}
              onClick={handleTest}
              className="bg-[#212227] hover:bg-[#2A2C33] disabled:opacity-40 border border-[#363840] text-[#E5E7EB] text-[13px] font-medium px-3.5 py-2 rounded-[4px] transition-colors cursor-pointer"
            >
              {testing ? 'Testando...' : 'Testar Conexão'}
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="text-[13px] text-[#9CA3AF] hover:text-white px-3 py-2 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 bg-[#2EB872] hover:bg-[#27A364] text-white text-[13px] font-semibold px-4 py-2 rounded-[4px] transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Configuração</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
