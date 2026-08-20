import React, { useState, useEffect } from 'react';
import type { User, Exercise, ErrorStats } from '../../types';
import { ERROR_CATEGORY_LABELS } from '../../types';
import {
  generateExercises, getUserExercises, getErrorStats,
} from '../../api';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseModal } from './ExerciseModal';
import { Loader2, Zap, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

interface Props { user: User; }

type Tab = 'pending' | 'completed';

const dedupeExercises = (items: Exercise[]): Exercise[] => {
  const seenVocabularyIds = new Set<string>();

  return items.filter((exercise) => {
    if (exercise.exercise_type !== 'vocabulary_cloze') {
      return true;
    }

    const exerciseId = exercise.content.id;
    if (!exerciseId) {
      return true;
    }

    if (seenVocabularyIds.has(exerciseId)) {
      return false;
    }

    seenVocabularyIds.add(exerciseId);
    return true;
  });
};

export const ExercisesPage: React.FC<Props> = ({ user }) => {
  const [exercises, setExercises]   = useState<Exercise[]>([]);
  const [errorStats, setErrorStats] = useState<ErrorStats[]>([]);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab]   = useState<Tab>('pending');
  const [selected, setSelected]     = useState<Exercise | null>(null);
  const [focusCats, setFocusCats]   = useState<string[]>([]);
  const [listCats, setListCats]     = useState<string[]>([]);
  const [exerciseTopic, setExerciseTopic] = useState('');

  const loadAll = async () => {
    setLoading(true);
    const [ex, stats] = await Promise.all([
      getUserExercises(),
      getErrorStats(),
    ]);
    setExercises(dedupeExercises(ex));
    setErrorStats(stats);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [user.id]);

  /* ── Generate exercises ─────────────────────────────────────────── */
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const newEx = await generateExercises(
        focusCats.length > 0 ? focusCats : undefined,
        3,
        exerciseTopic,
      );
      setExercises(prev => dedupeExercises([...newEx, ...prev]));
      setActiveTab('pending');
    } finally {
      setGenerating(false);
    }
  };

  /* ── After exercise completion ──────────────────────────────────── */
  const handleCompleted = (updated: Exercise) => {
    setExercises(prev =>
      dedupeExercises(
        prev.map(e => e.id === updated.id ? updated : e)
      )
    );
    setSelected(null);
    setActiveTab('completed');
  };

  const pending   = exercises.filter(e => !e.completed);
  const completed = exercises.filter(e =>  e.completed);
  const currentTabExercises = activeTab === 'pending' ? pending : completed;
  const shown = listCats.length > 0
    ? currentTabExercises.filter(e => listCats.includes(e.error_category))
    : currentTabExercises;

  /* ── Top categories to select focus ────────────────────────────── */
  const topCategories = Array.from(new Set([
    'vocabulary',
    'gender',
    ...errorStats.slice(0, 6).map(s => s.category),
  ]));
  const listCategories = Array.from(new Set([
    ...topCategories,
    ...exercises.map(exercise => exercise.error_category),
  ]));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-white sm:text-3xl">Exercises</h1>
        <p className="text-slate-400 text-sm">
          Targeted practice based on your most frequent mistakes.
        </p>
      </div>

      {/* ── Generate panel ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 sm:rounded-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-white mb-1 flex items-center gap-2">
              <Zap size={16} className="text-yellow-400" />
              Generate new exercises
            </h2>
            <p className="text-xs text-slate-400">
              Choose an optional category, type a precise focus, or let the AI decide.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-colors"
          >
            {generating
              ? <><Loader2 size={15} className="animate-spin" /> Generating...</>
              : <><RefreshCw size={15} /> Create exercises</>}
          </button>
        </div>

        <div className="mt-4">
          <label htmlFor="exercise-topic" className="block text-xs text-slate-400 mb-2">
            Topic or grammar focus (optional)
          </label>
          <input
            id="exercise-topic"
            type="text"
            value={exerciseTopic}
            onChange={(event) => setExerciseTopic(event.target.value)}
            placeholder="e.g. conjugation with you plural"
            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            maxLength={200}
          />
        </div>

        {/* Category chips */}
        {topCategories.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-slate-400 mb-2">
              Focus (optional):
            </div>
            <div className="flex flex-wrap gap-2">
              {topCategories.map(cat => {
                const active = focusCats.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => setFocusCats(prev =>
                      active ? prev.filter(c => c !== cat) : [...prev, cat]
                    )}
                    className={clsx(
                      'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      active
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                    )}
                  >
                    {ERROR_CATEGORY_LABELS[cat] || cat}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 w-fit">
        {(['pending', 'completed'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-5 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            )}
          >
            {tab === 'pending' ? `Open (${pending.length})` : `Completed (${completed.length})`}
          </button>
        ))}
      </div>

      {listCategories.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-slate-400">Filter:</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setListCats([])}
              className={clsx(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                listCats.length === 0
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
              )}
            >
              All
            </button>
            {listCategories.map(cat => {
              const active = listCats.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => setListCats(prev =>
                    active ? prev.filter(c => c !== cat) : [...prev, cat]
                  )}
                  className={clsx(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    active
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                  )}
                >
                  {ERROR_CATEGORY_LABELS[cat] || cat}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Exercise grid ────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading...
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          tab={activeTab}
          filtered={listCats.length > 0 && currentTabExercises.length > 0}
          onGenerate={handleGenerate}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map(ex => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              onClick={() => setSelected(ex)}
            />
          ))}
        </div>
      )}

      {/* ── Exercise modal ───────────────────────────────────────────── */}
      {selected && (
        <ExerciseModal
          exercise={selected}
          userId={user.id}
          onClose={() => setSelected(null)}
          onCompleted={handleCompleted}
        />
      )}
    </div>
  );
};

/* ── Empty state ────────────────────────────────────────────────────────── */
const EmptyState: React.FC<{ tab: Tab; filtered: boolean; onGenerate: () => void }> = ({
  tab, filtered, onGenerate,
}) => (
  <div className="bg-slate-800 rounded-2xl border border-slate-700 p-12 text-center">
    <div className="text-5xl mb-4">{filtered ? '🔎' : tab === 'pending' ? '📝' : '🎉'}</div>
    <div className="text-white font-semibold mb-2">
      {filtered
        ? 'No exercises match this filter'
        : tab === 'pending'
        ? 'No open exercises'
        : 'No completed exercises yet'}
    </div>
    <p className="text-slate-400 text-sm mb-6">
      {filtered
        ? 'Choose a different category or clear the selected filters.'
        : tab === 'pending'
        ? 'Have a few conversations first to collect mistakes, then generate exercises.'
        : 'Complete open exercises to see them here.'}
    </p>
    {tab === 'pending' && !filtered && (
      <button
        onClick={onGenerate}
        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors"
      >
        Generate exercises
      </button>
    )}
  </div>
);
