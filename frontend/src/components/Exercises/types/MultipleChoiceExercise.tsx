import React from 'react';
import type { ExerciseContent } from '../../../types';
import { clsx } from 'clsx';
import { HintReveal } from './HintReveal';

interface Props {
  content: ExerciseContent;
  answers: Record<string, string>;
  onChange: (id: string, value: string) => void;
  disabled: boolean;
}

export const MultipleChoiceExercise: React.FC<Props> = ({
  content, answers, onChange, disabled,
}) => {
  const questions = content.questions ?? [];

  return (
    <div className="space-y-6">
      {questions.map(q => (
        <div key={q.id} className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <div className="flex items-start gap-2 mb-3">
            <span className="bg-purple-700 text-white text-xs px-2 py-0.5 rounded-full font-bold shrink-0 mt-0.5">
              {q.id}
            </span>
            <div>
              <div className="text-white text-sm font-medium leading-relaxed">
                {q.question}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {q.options.map(opt => {
              const letter = opt.charAt(0);
              const isSelected = answers[String(q.id)] === letter;
              return (
                <button
                  key={opt}
                  onClick={() => !disabled && onChange(String(q.id), letter)}
                  disabled={disabled}
                  className={clsx(
                    'text-left px-4 py-3 rounded-xl text-sm border transition-all',
                    isSelected
                      ? 'bg-blue-600 border-blue-500 text-white font-semibold'
                      : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-blue-500/50 hover:bg-slate-700',
                    disabled && 'cursor-default opacity-70'
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {q.context && (
            <HintReveal label="Context">
              {q.context}
            </HintReveal>
          )}
        </div>
      ))}
    </div>
  );
};
