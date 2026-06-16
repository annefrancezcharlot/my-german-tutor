import React from 'react';
import type { ExerciseContent } from '../../../types';
import { HintReveal } from './HintReveal';

interface Props {
  content: ExerciseContent;
  answers: Record<string, string>;
  onChange: (id: string, value: string) => void;
  disabled: boolean;
}

export const CorrectionExercise: React.FC<Props> = ({
  content, answers, onChange, disabled,
}) => {
  const sentences = content.sentences ?? [];

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400">
        Correct the full sentence and write the improved version in the text field.
      </p>
      {sentences.map(s => (
        <div key={s.id} className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-red-700 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {s.id}
            </span>
          </div>

          {/* Erroneous sentence */}
          <div className="text-red-300 text-sm bg-red-900/20 rounded-lg px-3 py-2 mb-3 border border-red-900/30 font-mono">
            {s.text}
          </div>

          {/* Correction input */}
          <textarea
            value={answers[String(s.id)] ?? ''}
            onChange={e => onChange(String(s.id), e.target.value)}
            disabled={disabled}
            placeholder="Correct sentence..."
            rows={2}
            className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm border border-slate-600 focus:outline-none focus:border-green-500 disabled:opacity-60 resize-none transition-colors"
          />

          {s.error_type && (
            <HintReveal label="Error type">
              {s.error_type}
            </HintReveal>
          )}
        </div>
      ))}
    </div>
  );
};
