import { deleteSession } from '../../api';
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type {
  User, ConversationSession, ErrorStats, TimelineEntry,
  ExerciseTimelineEntry, ActivityTimelineEntry,
} from '../../types';
import {
  getUserSessions, getErrorStats, getErrorTimeline,
  getExerciseTimeline, getActivityTimeline,
} from '../../api';
import { ProgressChart } from './ProgressChart';
import { ExerciseScoreChart } from './ExerciseScoreChart';
import { ActivityChart } from './ActivityChart';
import { SessionHistoryTable } from './SessionHistoryTable';
import { SessionSummaryBanner } from './SessionSummaryBanner';
import { Loader2 } from 'lucide-react';
import {
  ERROR_CATEGORY_COLORS,
  ERROR_CATEGORY_LABELS,
} from '../../types';

interface Props { user: User; }

export const Dashboard: React.FC<Props> = ({ user }) => {
  const location = useLocation();
  const sessionSummary = (location.state as any)?.sessionSummary;

  const [sessions, setSessions]     = useState<ConversationSession[]>([]);
  const [errorStats, setErrorStats] = useState<ErrorStats[]>([]);
  const [timeline, setTimeline]     = useState<TimelineEntry[]>([]);
  const [exerciseTimeline, setExerciseTimeline] = useState<ExerciseTimelineEntry[]>([]);
  const [activityTimeline, setActivityTimeline] = useState<ActivityTimelineEntry[]>([]);
  const [startDate, setStartDate] = useState('');
  const [conversationSeries, setConversationSeries] = useState<'all' | 'score' | 'words'>('all');
  const [exerciseCategory, setExerciseCategory] = useState('all');
  const [activitySeries, setActivitySeries] = useState<'all' | 'conversations' | 'exercises' | 'flashcardSets'>('all');
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      getUserSessions(),
      getErrorStats(),
      getErrorTimeline(),
      getExerciseTimeline(),
      getActivityTimeline(),
    ]).then(([s, e, t, exerciseT, activityT]) => {
      setSessions(s);
      setErrorStats(e);
      setTimeline(t);
      setExerciseTimeline(exerciseT);
      setActivityTimeline(activityT);
    }).finally(() => setLoading(false));
  }, [user.id]);

  const handleDeleteSession = async (id: number) => {
    await deleteSession(id);
    setSessions(current => current.filter(session => session.id !== id));
    // Refresh statistics affected by the removed conversation and its errors.
    const results = await Promise.allSettled([
      getErrorStats(), getErrorTimeline(), getActivityTimeline(),
    ]);
    if (results[0].status === 'fulfilled') setErrorStats(results[0].value);
    if (results[1].status === 'fulfilled') setTimeline(results[1].value);
    if (results[2].status === 'fulfilled') setActivityTimeline(results[2].value);
  };

  /* ── Derived stats ──────────────────────────────────────────────── */
  const completedSessions = sessions.filter(s => s.ended_at);
  const inDateRange = (entry: { date: string }) => !startDate || entry.date.slice(0, 10) >= startDate;
  const visibleTimeline = timeline.filter(inDateRange);
  const visibleExercises = exerciseTimeline.filter(entry =>
    inDateRange(entry) && (exerciseCategory === 'all' || entry.category === exerciseCategory));
  const visibleActivity = activityTimeline.filter(inDateRange);
  const exerciseCategories = Array.from(new Set(exerciseTimeline.map(entry => entry.category))).sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 size={28} className="animate-spin mr-3" />
        Loading statistics...
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-8">

      {/* Banner after session end */}
      {sessionSummary && (
        <SessionSummaryBanner summary={sessionSummary} />
      )}

      <div>
        <h1 className="mb-1 text-2xl font-bold text-white sm:text-3xl">Your progress</h1>
        <p className="text-slate-400 text-sm">
          Learning progress · {user.username} · {user.level}
        </p>
      </div>

      {/* ── Charts ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <label htmlFor="chart-start-date" className="text-sm text-slate-300">Show graphs from</label>
        <input
          id="chart-start-date"
          type="date"
          value={startDate}
          onChange={event => setStartDate(event.target.value)}
          className="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white [color-scheme:dark]"
        />
        <button type="button" onClick={() => setStartDate('')} disabled={!startDate}
          className="min-h-11 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">
          All time
        </button>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <h2 className="font-semibold text-white mb-1">Score & conversation length</h2>
          <p className="mb-4 text-xs text-slate-500">Score per conversation, with written words as bars.</p>
          {visibleTimeline.length > 0
            ? <ProgressChart timeline={visibleTimeline} series={conversationSeries} />
            : <EmptyChart label="No conversations in this date range" />}
          <ChartLegend label="Conversation data" value={conversationSeries}
            onChange={value => setConversationSeries(value as typeof conversationSeries)}
            options={[["words", "Words", "#14b8a6"], ["score", "Score", "#3b82f6"]]} />
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <h2 className="font-semibold text-white mb-1">Exercise scores</h2>
          <p className="mb-4 text-xs text-slate-500">Average score per day and error category.</p>
          {visibleExercises.length > 0
            ? <ExerciseScoreChart entries={visibleExercises} />
            : <EmptyChart label="No exercises for this category and date range" />}
          <ChartLegend label="Exercise category" value={exerciseCategory} onChange={setExerciseCategory}
            options={exerciseCategories.map(category => [category, ERROR_CATEGORY_LABELS[category] || category, ERROR_CATEGORY_COLORS[category] || '#94a3b8'])} />
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <h2 className="font-semibold text-white mb-1">Activity</h2>
          <p className="mb-4 text-xs text-slate-500">Conversations, exercises, and studied card sets per day.</p>
          {visibleActivity.length > 0
            ? <ActivityChart entries={visibleActivity} series={activitySeries} />
            : <EmptyChart label="No activity in this date range" />}
          <ChartLegend label="Activity data" value={activitySeries}
            onChange={value => setActivitySeries(value as typeof activitySeries)}
            options={[["conversations", "Conversations", "#38bdf8"], ["exercises", "Exercises", "#a78bfa"], ["flashcardSets", "Card sets", "#fb923c"]]} />
        </div>
      </div>

      {/* ── Error category breakdown detail ─────────────────────────── */}
      {errorStats.length > 0 && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <h2 className="font-semibold text-white mb-4">Mistake details by category</h2>
          <ErrorCategoryDetail stats={errorStats} />
        </div>
      )}

      {/* ── Session history ─────────────────────────────────────────── */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
        <h2 className="font-semibold text-white mb-4">Conversation history</h2>
        {completedSessions.length > 0
          ? <SessionHistoryTable sessions={completedSessions} onDelete={handleDeleteSession} />
          : <EmptyChart label="No completed conversations yet" />}
      </div>
    </div>
  );
};

/* ── Small helpers ──────────────────────────────────────────────────────── */

const EmptyChart: React.FC<{ label: string }> = ({ label }) => (
  <div className="h-40 flex items-center justify-center text-slate-500 text-sm">
    {label}
  </div>
);

const ErrorCategoryDetail: React.FC<{ stats: ErrorStats[] }> = ({ stats }) => {
  const total = stats.reduce((a, s) => a + s.count, 0);

  return (
    <div className="space-y-3">
      {stats.map(stat => {
        const pct = total > 0 ? (stat.count / total) * 100 : 0;
        const color = ERROR_CATEGORY_COLORS[stat.category] || '#6b7280';
        const label = ERROR_CATEGORY_LABELS[stat.category] || stat.category;
        const subs  = Object.entries(stat.subcategories || {})
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3);

        return (
          <div key={stat.category}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm text-white font-medium">{label}</span>
                {subs.length > 0 && (
                  <span className="text-xs text-slate-500">
                    ({subs.map(([k]) => k).join(', ')})
                  </span>
                )}
              </div>
              <span className="text-sm text-slate-400">
                {stat.count} &nbsp;
                <span style={{ color }} className="font-semibold">
                  {pct.toFixed(1)}%
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};


const ChartLegend: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string, string][];
}> = ({ label, value, onChange, options }) => (
  <div role="group" aria-label={label} className="mt-2 flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
    <button type="button" aria-pressed={value === 'all'} onClick={() => onChange('all')}
      className={`whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] leading-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${value === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}>
      All
    </button>
    {options.map(([key, text, color]) => (
      <button key={key} type="button" aria-pressed={value === 'all' || value === key}
        title={value === key ? 'Show all data' : `Show only ${text.toLowerCase()}`}
        onClick={() => onChange(value === key ? 'all' : key)}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] leading-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${value === key ? 'bg-slate-700 text-white' : value === 'all' ? 'text-slate-300 hover:bg-slate-700/50' : 'text-slate-500 hover:bg-slate-700/50'}`}>
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color, opacity: value === 'all' || value === key ? 1 : 0.35 }} />
        {text}
      </button>
    ))}
  </div>
);
