import React from 'react';
import type { ExerciseContent } from '../../../types';
import { HintReveal } from './HintReveal';

interface Props {
  content: ExerciseContent;
  answers: Record<string, string>;
  onChange: (id: string, value: string) => void;
  disabled: boolean;
}

export const TranslationExercise: React.FC<Props> = ({
  content, answers, onChange, disabled,
}) => {
  const sentences = content.sentences ?? [];

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400">
        Translate the following sentences into German. Pay attention to the stated focus.
      </p>
      {sentences.map(s => (
        <div key={s.id} className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-teal-700 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {s.id}
            </span>
          </div>

          {/* English source */}
          <div className="text-blue-200 text-sm bg-blue-900/20 rounded-lg px-3 py-2 mb-3 border border-blue-900/30">
            🇬🇧 {s.english}
          </div>

          {/* German translation input */}
          <textarea
            value={answers[String(s.id)] ?? ''}
            onChange={e => onChange(String(s.id), e.target.value)}
            disabled={disabled}
            placeholder="German translation..."
            rows={2}
            className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm border border-slate-600 focus:outline-none focus:border-teal-500 disabled:opacity-60 resize-none transition-colors"
          />

          {s.focus && (
            <HintReveal label="Focus">
              {s.focus}
            </HintReveal>
          )}
        </div>
      ))}
    </div>
  );
};
