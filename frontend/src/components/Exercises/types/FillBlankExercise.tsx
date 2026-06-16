import React from 'react';
import type { ExerciseContent } from '../../../types';
import { HintReveal } from './HintReveal';

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
        return (
          <div key={s.id} className="bg-slate-900 rounded-xl p-4 border border-slate-700">
            <div className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {s.id}
              </span>
              Fill in the blank:
            </div>

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

            {s.hint && (
              <HintReveal label="Hint">
                {s.hint}
              </HintReveal>
            )}
          </div>
        );
      })}
    </div>
  );
};
