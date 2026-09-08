import React, { useState } from 'react';
import type { ConversationSession } from '../../types';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Link } from 'react-router-dom';

interface Props { sessions: ConversationSession[]; onDelete: (id: number) => Promise<void>; }

export const SessionHistoryTable: React.FC<Props> = ({ sessions, onDelete }) => {
  const [expanded, setExpanded] = useState<number | null>(null);

  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const remove = async (session: ConversationSession) => {
    if (!window.confirm(`Delete conversation “${session.topic}”? Its messages and review will be permanently removed.`)) return;
    setDeleting(session.id);
    setDeleteError(null);
    try {
      await onDelete(session.id);
    } catch {
      setDeleteError('The conversation could not be deleted. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const scoreColour = (s?: number | null) => {
    if (s == null) return 'text-slate-400';
    if (s >= 80) return 'text-green-400';
    if (s >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="overflow-x-auto">
      {deleteError && <p role="alert" className="mb-3 text-sm text-red-300">{deleteError}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-700">
            <th className="pb-2 pr-4 font-medium">Date</th>
            <th className="pb-2 pr-4 font-medium">Topic</th>
            <th className="pb-2 pr-4 font-medium text-center">Level</th>
            <th className="pb-2 pr-4 font-medium text-center">Messages</th>
            <th className="pb-2 pr-4 font-medium text-center">Mistakes</th>
            <th className="pb-2 font-medium text-center">Score</th>
            <th className="pb-2 pl-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {sessions.map(s => (
            <React.Fragment key={s.id}>
              <tr
                className="hover:bg-slate-700/30 cursor-pointer transition-colors"
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              >
                <td className="py-3 pr-4 text-slate-400 text-xs whitespace-nowrap">
                  {fmtDate(s.started_at)}
                </td>
                <td className="py-3 pr-4 text-white font-medium max-w-[200px] truncate">
                  {s.topic}
                  <span className="ml-2 text-xs text-slate-500">
                    {s.topic_category}
                  </span>
                </td>
                <td className="py-3 pr-4 text-center text-cyan-300 font-semibold">
                  {s.estimated_level ?? '—'}
                </td>
                <td className="py-3 pr-4 text-center text-slate-300">
                  {s.message_count}
                </td>
                <td className="py-3 pr-4 text-center text-amber-400 font-semibold">
                  {s.error_count}
                </td>
                <td className="py-3 text-center">
                  <span className={clsx('font-bold', scoreColour(s.score))}>
                    {s.score != null ? `${Math.round(s.score)}` : '—'}
                  </span>
                  <span
                    className="ml-1.5 text-slate-500 inline-block"
                    aria-label="Toggle summary"
                  >
                    {expanded === s.id
                      ? <ChevronUp size={13} className="inline" />
                      : <ChevronDown size={13} className="inline" />}
                  </span>
                </td>
                <td className="py-3 pl-3">
                  <button type="button" disabled={deleting !== null}
                    aria-label={`Delete conversation: ${s.topic}`}
                    onClick={event => { event.stopPropagation(); void remove(s); }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-red-300 hover:bg-red-950/50 disabled:opacity-50">
                    <Trash2 size={16} />{deleting === s.id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>

              {/* Expanded summary row */}
              {expanded === s.id && (
                <tr>
                  <td
                    colSpan={7}
                    className="pb-4 px-2"
                  >
                    <div className="bg-slate-900 rounded-xl p-4 text-xs text-slate-300 leading-relaxed border border-slate-700">
                      <div className="text-slate-400 font-semibold mb-1 uppercase tracking-wide text-[10px]">
                        Session summary
                      </div>
                      {s.summary ?? 'Detailed feedback is still being prepared.'}
                      <div className="mt-3">
                        <Link
                          to={`/sessions/${s.id}/review`}
                          className="text-cyan-300 hover:text-cyan-200"
                          onClick={event => event.stopPropagation()}
                        >
                          Open detailed review →
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};
