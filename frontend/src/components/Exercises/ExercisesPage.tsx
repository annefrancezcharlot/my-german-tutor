import React, { useState, useEffect } from 'react';
import type { User, Exercise } from '../../types';
import { generateExercises, getUserExercises } from '../../api';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseModal } from './ExerciseModal';
import { Info, Loader2, Zap, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useLocation, useNavigate } from 'react-router-dom';

interface Props { user: User; }

type Tab = 'pending' | 'completed';
interface ExerciseCategoryGroup {
  key: string;
  label: string;
  categories: string[];
  focusable: boolean;
  generationCategory?: string;
}

const exerciseCategoryGroups: ExerciseCategoryGroup[] = [
  {
    key: 'verbs_tenses',
    label: 'Verbs & tenses',
    categories: ['verb_conjugation', 'tense'],
    focusable: true,
    generationCategory: 'verb_conjugation',
  },
  {
    key: 'cases_declension',
    label: 'Cases & declension',
    categories: ['case'],
    focusable: true,
    generationCategory: 'case',
  },
  {
    key: 'noun_gender',
    label: 'Noun gender',
    categories: ['gender'],
    focusable: true,
    generationCategory: 'gender',
  },
  {
    key: 'prepositions',
    label: 'Prepositions',
    categories: ['preposition'],
    focusable: true,
    generationCategory: 'preposition',
  },
  {
    key: 'word_order',
    label: 'Word order',
    categories: ['word_order'],
    focusable: true,
    generationCategory: 'word_order',
  },
  {
    key: 'other_grammar',
    label: 'Other grammar',
    categories: ['grammar'],
    focusable: true,
    generationCategory: 'grammar',
  },
  {
    key: 'vocabulary',
    label: 'Vocabulary',
    categories: ['vocabulary'],
    focusable: false,
  },
];

const focusGroups = exerciseCategoryGroups.filter(group => group.focusable);

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
  const location = useLocation();
  const navigate = useNavigate();
  const [exercises, setExercises]   = useState<Exercise[]>([]);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<Tab>('pending');
  const [selected, setSelected]     = useState<Exercise | null>(null);
  const [selectedFocusGroups, setSelectedFocusGroups] = useState<string[]>([]);
  const [selectedFilterGroups, setSelectedFilterGroups] = useState<string[]>([]);
  const [exerciseTopic, setExerciseTopic] = useState('');

  const loadAll = async () => {
    setLoading(true);
    const ex = await getUserExercises();
    setExercises(dedupeExercises(ex));
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [user.id]);

  useEffect(() => {
    const openExerciseId = (location.state as { openExerciseId?: number } | null)?.openExerciseId;
    if (!openExerciseId || loading || selected) return;
    const exercise = exercises.find(item => item.id === openExerciseId);
    if (!exercise) return;
    setSelected(exercise);
    navigate(location.pathname, { replace: true, state: null });
  }, [exercises, loading, location.pathname, location.state, navigate, selected]);

  /* ── Generate exercises ─────────────────────────────────────────── */
  const handleGenerate = async () => {
    setGenerating(true);
    setGenerationError(null);
    try {
      const focusCategories = Array.from(new Set(
        focusGroups
          .filter(group => selectedFocusGroups.includes(group.key))
          .flatMap(group => group.generationCategory ? [group.generationCategory] : []),
      ));
      const exerciseCount = focusCategories.length > 0
        ? focusCategories.length
        : exerciseTopic.trim()
        ? 1
        : 3;
      const newEx = await generateExercises(
        focusCategories.length > 0 ? focusCategories : undefined,
        exerciseCount,
        exerciseTopic,
      );
      setExercises(prev => dedupeExercises([...newEx, ...prev]));
      setActiveTab('pending');
    } catch {
      setGenerationError(
        'No supported exercise could be created for this focus. Choose a listed category or a more specific grammar rule.',
      );
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
  const selectedFilterCategories = exerciseCategoryGroups
    .filter(group => selectedFilterGroups.includes(group.key))
    .flatMap(group => group.categories);
  const shown = selectedFilterGroups.length > 0
    ? currentTabExercises.filter(e => selectedFilterCategories.includes(e.error_category))
    : currentTabExercises;

  const filterGroups = exerciseCategoryGroups.filter(group =>
    group.focusable || exercises.some(exercise => group.categories.includes(exercise.error_category))
  );

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

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-800/50 bg-blue-950/35 px-3 py-2.5 text-xs leading-relaxed text-blue-100">
          <Info size={15} className="mt-0.5 shrink-0 text-blue-400" />
          <span>
            Have new conversations regularly to keep your practice current. Newly generated
            exercises combine your most frequent weak areas with the latest recorded examples.
          </span>
        </div>

        {generating && (
          <div className="mt-4" role="status" aria-live="polite">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-blue-200">
                Generating and proofreading exercises…
              </span>
              <span className="text-slate-500">This may take a moment</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-700"
              role="progressbar"
              aria-label="Exercise generation in progress"
              aria-valuetext="Generating and proofreading exercises"
            >
              <div className="exercise-generation-progress h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-500" />
            </div>
          </div>
        )}

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
        {focusGroups.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-slate-400 mb-2">
              Focus (optional):
            </div>
            <div className="flex flex-wrap gap-2">
              {focusGroups.map(group => {
                const active = selectedFocusGroups.includes(group.key);
                return (
                  <button
                    key={group.key}
                    onClick={() => setSelectedFocusGroups(prev =>
                      active ? prev.filter(key => key !== group.key) : [...prev, group.key]
                    )}
                    className={clsx(
                      'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      active
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                    )}
                  >
                    {group.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {generationError && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/30 px-4 py-3 text-sm text-red-200">
          {generationError}
        </div>
      )}

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

      {filterGroups.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-slate-400">Filter:</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedFilterGroups([])}
              className={clsx(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                selectedFilterGroups.length === 0
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
              )}
            >
              All
            </button>
            {filterGroups.map(group => {
              const active = selectedFilterGroups.includes(group.key);
              return (
                <button
                  key={group.key}
                  onClick={() => setSelectedFilterGroups(prev =>
                    active ? prev.filter(key => key !== group.key) : [...prev, group.key]
                  )}
                  className={clsx(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    active
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                  )}
                >
                  {group.label}
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
          filtered={selectedFilterGroups.length > 0 && currentTabExercises.length > 0}
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
