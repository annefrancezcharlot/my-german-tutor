import React from 'react';
import type { ExerciseContent } from '../../../types';
import { clsx } from 'clsx';

interface Props {
  content: ExerciseContent;
  answers: Record<string, string>;
  correctAnswers?: Record<string, string | string[]> | null;
  onChange: (id: string, value: string) => void;
  disabled: boolean;
}

const articles = ['der', 'die', 'das'];

export const GenderChoiceExercise: React.FC<Props> = ({
  content, answers, correctAnswers, onChange, disabled,
}) => {
  const items = content.items ?? [];

  return (
    <div className="space-y-3">
      {items.map(item => {
        const itemId = String(item.id);
        const selectedAnswer = answers[itemId];
        const correctAnswer = correctAnswers?.[itemId];
        const correctAnswerList = Array.isArray(correctAnswer)
          ? correctAnswer
          : correctAnswer
          ? [correctAnswer]
          : [];
        const answered = !!selectedAnswer;

        return (
          <div
            key={item.id}
            className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-cyan-700 px-2 py-0.5 text-xs font-bold text-white">
                  {item.id}
                </span>
                <span className="text-lg font-semibold text-white">{item.noun}</span>
              </div>
              {(item.translation || item.plural) && (
                <div className="mt-1 text-xs text-slate-400">
                  {item.translation && <span>{item.translation}</span>}
                  {item.translation && item.plural && <span> · </span>}
                  {item.plural && <span>plural: {item.plural}</span>}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {articles.map(article => {
                const selected = selectedAnswer === article;
                const isCorrectArticle = correctAnswerList.includes(article);
                const isWrongSelection = answered && selected && !isCorrectArticle;

                return (
                  <button
                    key={article}
                    type="button"
                    onClick={() => !disabled && !answered && onChange(itemId, article)}
                    disabled={disabled || answered}
                    className={clsx(
                      'min-w-16 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                      answered && isCorrectArticle
                        ? 'border-green-500 bg-green-600 text-white'
                        : isWrongSelection
                        ? 'border-red-500 bg-red-600 text-white'
                        : selected
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-blue-500/50 hover:bg-slate-700',
                      (disabled || answered) && 'cursor-default',
                      disabled && 'opacity-70',
                    )}
                  >
                    {article}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
