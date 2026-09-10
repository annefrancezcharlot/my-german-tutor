import React from 'react';
import type { ExerciseContent } from '../../../types';

interface Props {
  content: ExerciseContent;
  answers: Record<string, string>;
  onChange: (id: string, value: string) => void;
  disabled: boolean;
}

export const FillBlankExercise: React.FC<Props> = ({
  content, answers, onChange, disabled,
}) => {
  const sentences = content.sentences ?? [];

  return (
    <div className="space-y-5">
      {sentences.map(s => {
        const parts = (s.text ?? '').split('___');
        const isVerbTask = !!(s.verb || s.tense);
        const isCaseTask = !!(s.word || s.case || s.answer_scope);
        return (
          <div key={s.id} className="bg-slate-900 rounded-xl p-4 border border-slate-700">
            <div className="mb-3 flex items-center gap-2">
              <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {s.id}
              </span>
            </div>

            {isCaseTask && (
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                {s.word && (
                  <span className="rounded-lg border border-blue-700/60 bg-blue-900/30 px-2.5 py-1 text-blue-100">
                    Word: <strong>{s.word}</strong>
                  </span>
                )}
                {s.case && (
                  <span className="rounded-lg border border-amber-700/60 bg-amber-900/30 px-2.5 py-1 text-amber-100">
                    Case: <strong>{s.case}</strong>
                  </span>
                )}
                {s.answer_scope && (
                  <span className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1 text-slate-200">
                    Enter: <strong>{s.answer_scope === 'article_only' ? 'article only' : 'complete phrase'}</strong>
                  </span>
                )}
              </div>
            )}

            {/* Sentence with inline input */}
            <div className="text-white text-base leading-loose flex flex-wrap items-center gap-1">
              {parts.map((part, pIdx) => (
                <React.Fragment key={pIdx}>
                  <span>{part}</span>
                  {pIdx < parts.length - 1 && (
                    <input
                      type="text"
                      value={answers[String(s.id)] ?? ''}
                      onChange={e => onChange(String(s.id), e.target.value)}
                      disabled={disabled}
                      placeholder="…"
                      className="inline-block bg-slate-700 border-b-2 border-blue-500 text-white px-2 py-0.5 rounded text-sm min-w-[80px] focus:outline-none focus:border-blue-400 disabled:opacity-60 transition-colors"
                    />
                  )}
                </React.Fragment>
                ))}
            </div>

            {isVerbTask && (
              <div className="mt-2 text-sm text-slate-400">
                ({[s.verb, s.tense].filter(Boolean).join(' · ')})
              </div>
            )}

          </div>
        );
      })}
    </div>
  );
};
