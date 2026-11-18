import React, { useState } from 'react';
import { Bookmark, Check, Copy, Trash2, X } from 'lucide-react';
import type { AdvancedSearchFilters, SavedPreset } from '../shared/cnpj';

interface SaveShareModalProps {
  open: boolean;
  onClose: () => void;
  currentFilters: AdvancedSearchFilters;
  presets: SavedPreset[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: SavedPreset) => void;
  onDeletePreset: (id: string) => void;
}

export function SaveShareModal({
  open,
  onClose,
  currentFilters,
  presets,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
}: SaveShareModalProps) {
  const [presetName, setPresetName] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  if (!open) return null;

  const buildShareUrl = () => {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(currentFilters))));
    const url = new URL(window.location.href);
    url.searchParams.set('f', encoded);
    return url.toString();
  };

  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(buildShareUrl());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetName.trim()) return;
    onSavePreset(presetName.trim());
    setPresetName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg bg-[#1B1C20] border border-[#32343C] rounded-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2C2E35]">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-[#3B9AE8]" />
            <h2 className="text-[15px] font-semibold text-white">
              Salvar ou Compartilhar Pesquisa
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

        <div className="p-5 space-y-5">
          {/* Shareable Link */}
          <div>
            <label className="block text-[13px] font-medium text-[#E5E7EB] mb-1.5">
              Compartilhar Link com Filtros Atuais
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={buildShareUrl()}
                className="flex-1 bg-[#212227] border border-[#363840] rounded-[4px] h-[38px] px-3 font-mono-data text-[12px] text-[#9CA3AF] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyShareUrl}
                className="inline-flex items-center gap-1.5 bg-[#1A6FB3] hover:bg-[#175F9A] text-white text-[13px] font-medium px-4 h-[38px] rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Save Preset */}
          <form onSubmit={handleSave} className="pt-2 border-t border-[#2C2E35]">
            <label className="block text-[13px] font-medium text-[#E5E7EB] mb-1.5">
              Salvar Pesquisa nos Favoritos
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Ex: Clínicas Ativas Teresina com Celular"
                className="flex-1 bg-[#212227] border border-[#363840] focus:border-[#2585D6] rounded-[4px] h-[38px] px-3 text-[13px] text-white placeholder-[#6B7280] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!presetName.trim()}
                className="bg-[#2EB872] hover:bg-[#27A364] disabled:opacity-40 text-white text-[13px] font-semibold px-4 h-[38px] rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
              >
                Salvar
              </button>
            </div>
          </form>

          {/* Saved Presets List */}
          <div className="pt-2 border-t border-[#2C2E35]">
            <h3 className="text-[12px] font-semibold text-[#9CA3AF] mb-2">
              Pesquisas Salvas ({presets.length})
            </h3>
            {presets.length === 0 ? (
              <p className="text-[12.5px] text-[#6B7280] py-2">
                Nenhuma pesquisa salva ainda.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {presets.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 bg-[#212227] border border-[#2E3138] rounded-[4px] px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onLoadPreset(p);
                        onClose();
                      }}
                      className="text-left flex-1 min-w-0 cursor-pointer group"
                    >
                      <div className="text-[13px] font-medium text-[#E5E7EB] group-hover:text-white truncate">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-[#9CA3AF]">
                        {p.filters.ufs.length > 0 ? p.filters.ufs.join(', ') : 'Todo o Brasil'} ·{' '}
                        {p.filters.situacaoCadastral.join(', ')}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePreset(p.id)}
                      className="text-[#9CA3AF] hover:text-[#F87171] p-1 cursor-pointer"
                      aria-label={`Excluir ${p.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
