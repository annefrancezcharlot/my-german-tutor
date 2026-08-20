import React, { useEffect, useRef, useState } from 'react';
import { Languages, Loader2, X } from 'lucide-react';
import { translateText } from '../../api';
import type { TranslationResponse, TranslationTarget } from '../../types';

const targetOptions: Array<{ value: TranslationTarget; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'German', label: 'German' },
  { value: 'English', label: 'English' },
  { value: 'French', label: 'French' },
];

interface Props {
  fullWidth?: boolean;
}

export const GlobalTranslator: React.FC<Props> = ({ fullWidth = false }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<TranslationTarget>('auto');
  const [result, setResult] = useState<TranslationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const handleTranslate = async () => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      setResult(await translateText(trimmed, targetLanguage));
    } catch {
      setError('Translation could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      handleTranslate();
    }
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white ${fullWidth ? 'w-full justify-start' : ''}`}
        title="Translate"
      >
        <Languages size={18} />
        <span className={fullWidth ? '' : 'hidden lg:inline'}>Translate</span>
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[min(22rem,calc(100vw-2rem))]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Quick translate</h2>
              <p className="text-xs text-slate-400">German ↔ English automatically</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            <textarea
              ref={inputRef}
              value={text}
              onChange={event => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              maxLength={1200}
              placeholder="Word or sentence..."
              className="w-full resize-none rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-blue-500"
            />

            <div className="flex items-center gap-2">
              <select
                value={targetLanguage}
                onChange={event => setTargetLanguage(event.target.value as TranslationTarget)}
                className="h-10 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-blue-500"
              >
                {targetOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleTranslate}
                disabled={!text.trim() || loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
                Translate
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-800/50 bg-red-900/30 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-4 space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-3">
              <div className="text-xs font-semibold uppercase text-blue-300">
                {result.source_language ?? 'Auto'} → {result.target_language ?? targetLanguage}
              </div>
              <div className="text-base font-semibold leading-relaxed text-white">
                {result.translation}
              </div>
              {result.alternatives.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.alternatives.map(alternative => (
                    <span
                      key={alternative}
                      className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300"
                    >
                      {alternative}
                    </span>
                  ))}
                </div>
              )}
              {result.notes && (
                <p className="text-sm leading-relaxed text-slate-300">{result.notes}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
