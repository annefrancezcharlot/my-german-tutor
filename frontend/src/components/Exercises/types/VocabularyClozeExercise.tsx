import React, { useMemo, useState } from 'react';
import type { ExerciseContent } from '../../../types';
import { clsx } from 'clsx';
import { Check, Eye, EyeOff, RotateCcw } from 'lucide-react';

interface Props {
  content: ExerciseContent;
  answers: Record<string, string>;
  correctAnswers?: Record<string, string | string[]> | null;
  onChange: (id: string, value: string) => void;
  disabled: boolean;
}

const normalizeWord = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const addAnswerVariant = (variants: Set<string>, value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    value.forEach(item => addAnswerVariant(variants, item));
    return;
  }

  if (value) {
    variants.add(normalizeWord(value));
  }
};

export const VocabularyClozeExercise: React.FC<Props> = ({
  content, answers, correctAnswers, onChange, disabled,
}) => {
  const sourceText = content.source_text ?? '';
  const gaps = content.gaps ?? [];
  const wordBankEntries = useMemo(() => {
    return content.word_bank_entries?.length
      ? content.word_bank_entries
      : (content.word_bank ?? []).map((label, index) => ({
          label,
          gap_id: gaps[index]?.id ?? null,
        }));
  }, [content.word_bank, content.word_bank_entries, gaps]);
  const parts = sourceText.split(/(\[\d+\])/g);
  const [revealedDefinitions, setRevealedDefinitions] = useState<Record<string, boolean>>({});
  const shuffledWordBank = useMemo(() => {
    const shuffled = wordBankEntries.map((entry, index) => ({ ...entry, index }));
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [wordBankEntries]);
  const usedWords = useMemo(() => {
    return new Set(
      Object.values(answers)
        .map(normalizeWord)
        .filter(Boolean),
    );
  }, [answers]);
  const wordBankAnswerVariants = useMemo(() => {
    return wordBankEntries.map(entry => {
      const variants = new Set<string>();
      const gapId = entry.gap_id === null || entry.gap_id === undefined
        ? null
        : String(entry.gap_id);

      if (gapId) {
        addAnswerVariant(variants, correctAnswers?.[gapId]);
      }

      return variants;
    });
  }, [correctAnswers, wordBankEntries]);

  const isWordBankEntryUsed = (index: number) => {
    const variants = wordBankAnswerVariants[index];
    return variants ? [...variants].some(variant => usedWords.has(variant)) : false;
  };

  const toggleDefinition = (gapId: number) => {
    setRevealedDefinitions(prev => ({
      ...prev,
      [String(gapId)]: !prev[String(gapId)],
    }));
  };

  const clearGap = (gapId: string) => {
    if (disabled) return;
    onChange(gapId, '');
  };

  const renderPart = (part: string, index: number) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (!match) {
      return <span key={`text-${index}`}>{part}</span>;
    }

    const gapId = match[1];
    const gap = gaps.find(item => String(item.id) === gapId);

    return (
      <span key={`gap-${gapId}`} className="inline-flex items-center mx-1 my-1 align-middle">
        <button
          type="button"
          className="mr-1 rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-bold text-slate-950"
          onClick={() => toggleDefinition(Number(gapId))}
          title="Show or hide definition"
        >
          {gapId}
        </button>
        <input
          type="text"
          disabled={disabled}
          value={answers[gapId] ?? ''}
          onChange={e => onChange(gapId, e.target.value)}
          placeholder="Enter word"
          className={clsx(
            'h-10 w-40 rounded-xl border px-3 py-2 text-sm font-medium transition-all focus:outline-none focus:ring-2',
            answers[gapId]
              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-100'
              : 'border-slate-500 bg-slate-800/90 text-slate-100 placeholder:text-slate-500 hover:border-blue-400',
            !disabled && 'focus:border-blue-400 focus:ring-blue-500/30',
            disabled && 'cursor-default opacity-70'
          )}
          title={gap?.hint}
          autoComplete="off"
          spellCheck={false}
        />
        {!disabled && answers[gapId] && (
          <button
            type="button"
            onClick={() => clearGap(gapId)}
            className="ml-1 rounded-full border border-slate-600 bg-slate-800 p-1 text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
            title="Clear field"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-300">
            Word bank
          </span>
          <span className="rounded-full bg-blue-900/40 px-2.5 py-1 text-xs font-semibold text-blue-300">
            {content.topic_label ?? 'Vocabulary'}
          </span>
          {content.preparation_use && (
            <span className="rounded-full bg-emerald-900/30 px-2.5 py-1 text-xs text-emerald-300">
              Preparation
            </span>
          )}
          <span className="text-xs text-slate-400">
            Type the matching word into each gap.
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {shuffledWordBank.map(({ label, index }) => {
            const isUsed = isWordBankEntryUsed(index);

            return (
              <span
                key={`${label}-${index}`}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  isUsed
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                    : 'border-orange-400/40 bg-orange-500/10 text-orange-100',
                )}
                title={isUsed ? 'Already used' : 'Not used yet'}
              >
                {isUsed && <Check size={13} />}
                <span className={clsx(isUsed && 'line-through decoration-emerald-300/70')}>
                  {label}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_320px]">
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Text
          </div>
          <div className="text-base leading-8 text-slate-100">
            {parts.map(renderPart)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <div className="mb-3 text-sm font-semibold text-white">Hidden definitions</div>
          <div className="space-y-2">
            {gaps.map(gap => {
              const isRevealed = !!revealedDefinitions[String(gap.id)];

              return (
                <div
                  key={gap.id}
                  className="rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-bold text-slate-950">
                      {gap.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleDefinition(gap.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                    >
                      {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                      {isRevealed ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  <div className="mt-2 text-xs leading-relaxed text-slate-300">
                    {isRevealed ? (
                      gap.hint ?? 'No definition available'
                    ) : (
                      <span className="text-slate-500">Definition hidden</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
