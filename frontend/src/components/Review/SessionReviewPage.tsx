import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

import { getSessionReview, retrySessionReview } from '../../api';
import type { SessionReview } from '../../types';

export const SessionReviewPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const id = Number(sessionId);
  const [review, setReview] = useState<SessionReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!Number.isSafeInteger(id) || id <= 0) return;
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      try {
        const result = await getSessionReview(id);
        if (cancelled) return;
        setReview(result);
        setError(null);
        if (result.status === 'preparing') timer = window.setTimeout(load, 2000);
      } catch {
        if (!cancelled) setError('The review could not be loaded.');
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [id, retrying]);

  const retry = async () => {
    setRetrying(true);
    setError(null);
    try {
      await retrySessionReview(id);
    } catch {
      setError('The review retry could not be started.');
    } finally {
      setRetrying(false);
    }
  };

  if (!review) {
    return <div className="flex min-h-[50vh] items-center justify-center text-slate-300">{error ?? <><Loader2 className="mr-2 animate-spin" /> Loading review…</>}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="text-sm text-cyan-300">Session review</div><h1 className="mt-1 text-2xl font-semibold">{review.topic}</h1></div>
        <Link to="/dashboard" className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Back to history</Link>
      </div>

      {review.status !== 'ready' ? (
        <div className="rounded-2xl border border-cyan-700/50 bg-cyan-950/30 p-8 text-center">
          <Loader2 className="mx-auto animate-spin text-cyan-300" size={28} />
          <h2 className="mt-4 font-semibold">Preparing your detailed feedback</h2>
          <p className="mt-2 text-sm text-slate-400">Your conversation is safely saved. Corrections and the assessment will appear here automatically.</p>
          <button onClick={() => void retry()} disabled={retrying} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm disabled:opacity-40"><RefreshCw size={15} /> Retry analysis</button>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-700 bg-slate-800 p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><div className="text-xs uppercase tracking-wide text-slate-500">Score</div><div className="mt-1 text-3xl font-bold text-cyan-300">{review.score == null ? '—' : Math.round(review.score)}</div></div>
              <div><div className="text-xs uppercase tracking-wide text-slate-500">Estimated level</div><div className="mt-1 text-3xl font-bold text-violet-300">{review.estimated_level ?? '—'}</div></div>
              <div><div className="text-xs uppercase tracking-wide text-slate-500">Mistake sentences</div><div className="mt-1 text-3xl font-bold text-amber-300">{review.mistakes.length}</div></div>
            </div>
            <div className="mt-6 border-t border-slate-700 pt-5"><h2 className="font-semibold">Summary, strengths and priorities</h2><p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-300">{review.summary}</p></div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Detailed corrections</h2>
            {review.mistakes.length === 0 ? (
              <div className="rounded-2xl border border-green-700/40 bg-green-950/30 p-6 text-green-200">No qualifying mistakes were found in this conversation.</div>
            ) : (
              <div className="space-y-4">
                {review.mistakes.map((mistake, index) => (
                  <article key={mistake.message_id} className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sentence {index + 1}</div>
                    <div className="mt-3 rounded-xl bg-slate-900/70 p-4"><div className="text-xs text-slate-500">Original</div><p className="mt-1 text-slate-200">{mistake.original}</p></div>
                    <div className="mt-2 rounded-xl border border-green-800/50 bg-green-950/25 p-4"><div className="text-xs text-green-400">Corrected sentence</div><p className="mt-1 text-green-100">{mistake.corrected}</p></div>
                    <div className="mt-4 space-y-3">
                      {mistake.corrections.map(correction => (
                        <div key={correction.id} className="rounded-xl border border-slate-700 p-4 text-sm">
                          <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-slate-700 px-2 py-1 text-xs">{correction.category.replace('_', ' ')}</span>{correction.subcategory && <span className="text-xs text-slate-400">{correction.subcategory}</span>}<span className={clsx('ml-auto rounded px-2 py-1 text-xs', correction.severity === 'severe' ? 'bg-red-900 text-red-200' : correction.severity === 'medium' ? 'bg-amber-900 text-amber-200' : 'bg-blue-900 text-blue-200')}>{correction.severity}</span></div>
                          <div className="mt-3 text-slate-300"><span className="text-red-300 line-through">{correction.original}</span><span className="mx-2">→</span><span className="text-green-300">{correction.corrected}</span></div>
                          <p className="mt-2 leading-6 text-slate-400">{correction.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section className="rounded-2xl border border-slate-700 bg-slate-800">
        <button onClick={() => setShowTranscript(value => !value)} className="flex w-full items-center justify-between p-5 text-left font-semibold"><span>Full transcript ({review.transcript.length} turns)</span>{showTranscript ? <ChevronUp /> : <ChevronDown />}</button>
        {showTranscript && <div className="space-y-3 border-t border-slate-700 p-5">{review.transcript.map((message, index) => <div key={message.id ?? index} className={clsx('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}><div className={clsx('max-w-[85%] rounded-xl px-4 py-3 text-sm', message.role === 'user' ? 'bg-blue-700' : 'bg-slate-700')}>{message.content}</div></div>)}</div>}
      </section>
      {error && <div className="rounded-lg bg-red-950/60 p-3 text-sm text-red-200">{error}</div>}
    </div>
  );
};
