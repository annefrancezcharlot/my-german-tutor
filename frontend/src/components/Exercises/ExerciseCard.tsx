import React from 'react';
import type { Exercise } from '../../types';
import { ERROR_CATEGORY_COLORS, ERROR_CATEGORY_LABELS } from '../../types';
import { CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
  exercise: Exercise;
  onClick: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  fill_blank:       '✏️',
  correction:       '🔧',
  multiple_choice:  '🔤',
  translation:      '🌐',
  vocabulary_cloze: '📚',
};

const TYPE_LABELS: Record<string, string> = {
  fill_blank:      'Fill in the blank',
  correction:      'Error correction',
  multiple_choice: 'Multiple Choice',
  translation:     'Translation',
  vocabulary_cloze:'Vocabulary cloze',
};

export const ExerciseCard: React.FC<Props> = ({ exercise, onClick }) => {
  const catColor = ERROR_CATEGORY_COLORS[exercise.error_category] || '#6b7280';
  const catLabel = ERROR_CATEGORY_LABELS[exercise.error_category] || exercise.error_category;
  const isGenderChoice = exercise.exercise_type === 'multiple_choice' && !!exercise.content.items?.length;
  const typeIcon = isGenderChoice ? '⚥' : TYPE_ICONS[exercise.exercise_type] ?? '📄';
  const typeLabel = isGenderChoice ? 'Gender choice' : TYPE_LABELS[exercise.exercise_type];

  const scoreColour = (s: number) =>
    s >= 80 ? 'text-green-400' : s >= 60 ? 'text-yellow-400' : 'text-red-400';

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left bg-slate-800 rounded-2xl border p-5 transition-all',
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30',
        exercise.completed
          ? 'border-slate-600 opacity-80'
          : 'border-slate-700 hover:border-blue-600/50'
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl">{typeIcon}</span>
        {exercise.completed ? (
          <div className="flex items-center gap-1">
            <CheckCircle2 size={14} className="text-green-400" />
            {exercise.score != null && (
              <span className={clsx('text-sm font-bold', scoreColour(exercise.score))}>
                {Math.round(exercise.score)}%
              </span>
            )}
          </div>
        ) : (
          <Clock size={14} className="text-slate-500" />
        )}
      </div>

      {/* Category badge */}
      <div className="mb-2">
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: catColor + '28', color: catColor }}
        >
          {catLabel}
        </span>
      </div>

      {/* Title */}
      <div className="font-semibold text-white text-sm leading-tight mb-1 line-clamp-2">
        {exercise.title}
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-slate-500">
          {typeLabel} · {exercise.difficulty}
        </span>
        <ChevronRight size={14} className="text-slate-500" />
      </div>
    </button>
  );
};
