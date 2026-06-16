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

  /* ── Derived stats ──────────────────────────────────────────────── */
  const completedSessions = sessions.filter(s => s.ended_at);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 size={28} className="animate-spin mr-3" />
        Loading statistics...
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Banner after session end */}
      {sessionSummary && (
        <SessionSummaryBanner summary={sessionSummary} />
      )}

      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Your progress</h1>
        <p className="text-slate-400 text-sm">
          Learning progress · {user.username} · {user.level}
        </p>
      </div>

      {/* ── Charts ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <h2 className="font-semibold text-white mb-1">Score & conversation length</h2>
          <p className="mb-4 text-xs text-slate-500">Score per conversation, with written words as bars.</p>
          {timeline.length > 0
            ? <ProgressChart timeline={timeline} />
            : <EmptyChart label="No completed conversations yet" />}
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <h2 className="font-semibold text-white mb-1">Exercise scores</h2>
          <p className="mb-4 text-xs text-slate-500">Average score per day and error category.</p>
          {exerciseTimeline.length > 0
            ? <ExerciseScoreChart entries={exerciseTimeline} />
            : <EmptyChart label="No completed exercises yet" />}
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <h2 className="font-semibold text-white mb-1">Activity</h2>
          <p className="mb-4 text-xs text-slate-500">Conversations, exercises, and studied card sets per day.</p>
          {activityTimeline.length > 0
            ? <ActivityChart entries={activityTimeline} />
            : <EmptyChart label="No activity data yet" />}
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
          ? <SessionHistoryTable sessions={completedSessions} />
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
