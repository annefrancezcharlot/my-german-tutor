import React, { useState } from 'react';
import { X, Trophy } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
  summary: {
    summary: string;
    score: number;
    error_count: number;
    estimated_level?: string;
  };
}

export const SessionSummaryBanner: React.FC<Props> = ({ summary }) => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const score = Math.round(summary.score ?? 0);
  const scoreColour =
    score >= 80 ? 'text-green-400' :
    score >= 60 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="bg-gradient-to-r from-blue-900/60 to-indigo-900/60 border border-blue-700/50 rounded-2xl p-5 relative">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-4">
        <div className="text-4xl shrink-0">🏁</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h2 className="font-bold text-white text-lg">Conversation finished!</h2>
            <div className="flex items-center gap-2 text-sm">
              <Trophy size={14} className={scoreColour} />
              <span className={clsx('font-bold text-lg', scoreColour)}>
                {score} points
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-amber-400">{summary.error_count} mistakes</span>
              {summary.estimated_level && (
                <>
                  <span className="text-slate-400">·</span>
                  <span className="text-cyan-300">Estimated: {summary.estimated_level}</span>
                </>
              )}
            </div>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">{summary.summary}</p>
        </div>
      </div>
    </div>
  );
};
