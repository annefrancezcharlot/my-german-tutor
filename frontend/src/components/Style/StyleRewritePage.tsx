import React, { useEffect, useMemo, useState } from 'react';
import type { ConversationSession, StyleRewriteItem, StyleRewriteMode, User } from '../../types';
import { getSavedStyleRewrites, getUserSessions, rewriteSessionStyle } from '../../api';
import { clsx } from 'clsx';
import {
  ArrowRight,
  CalendarDays,
  Loader2,
  MessageSquareText,
  Volume2,
  Wand2,
} from 'lucide-react';
import { playSpeech } from '../../utils/audio';

interface Props {
  user: User;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const rewriteModes: Array<{ value: StyleRewriteMode; label: string }> = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'natural', label: 'Natural' },
  { value: 'casual', label: 'Casual' },
  { value: 'elevated', label: 'Elevated' },
];

const swissDialects = [
  'Aargau',
  'Bern',
  'Basel',
  'Graubünden',
  'Luzern',
  'St. Gallen',
  'Valais',
  'Zürich',
];

const speechStyleByRewriteMode: Record<StyleRewriteMode, string> = {
  minimal: 'neutral clear standard German',
  natural: 'natural conversational German',
  casual: 'relaxed informal German',
  elevated: 'polished formal German',
  swiss_german: 'natural conversational Swiss German',
};

const speechModelByRewriteMode: Partial<Record<StyleRewriteMode, string>> = {
  swiss_german: 'gradio_swiss_tts',
};

export const StyleRewritePage: React.FC<Props> = ({ user }) => {
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [rewrites, setRewrites] = useState<StyleRewriteItem[]>([]);
  const [rewriteMode, setRewriteMode] = useState<StyleRewriteMode>('natural');
  const [swissDialect, setSwissDialect] = useState('Bern');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteRequested, setRewriteRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakingText, setSpeakingText] = useState<string | null>(null);

  useEffect(() => {
    const loadSessions = async () => {
      setLoadingSessions(true);
      setError(null);
      try {
        const loadedSessions = await getUserSessions();
        setSessions(loadedSessions);
        setSelectedSessionId(loadedSessions[0]?.id ?? null);
      } catch {
        setError('Sessions could not be loaded.');
      } finally {
        setLoadingSessions(false);
      }
    };

    loadSessions();
  }, [user.id]);

  const selectedSession = useMemo(
    () => sessions.find(session => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );
  const swissDialectSelected = rewriteMode === 'swiss_german';
  const selectedSwissDialect = swissDialectSelected ? swissDialect : undefined;

  useEffect(() => {
    if (!selectedSessionId) {
      setRewrites([]);
      return;
    }

    const loadSavedRewrites = async () => {
      setLoadingSaved(true);
      setRewriteRequested(false);
      setError(null);
      try {
        const response = await getSavedStyleRewrites(
          selectedSessionId,
          rewriteMode,
          selectedSwissDialect,
        );
        setRewrites(response.rewrites);
      } catch {
        setError('Saved style rewrites could not be loaded.');
      } finally {
        setLoadingSaved(false);
      }
    };

    loadSavedRewrites();
  }, [selectedSessionId, rewriteMode, selectedSwissDialect, user.id]);

  const handleRewrite = async () => {
    if (!selectedSessionId) return;

    setRewriting(true);
    setRewriteRequested(true);
    setError(null);
    setRewrites([]);

    try {
      const response = await rewriteSessionStyle(
        selectedSessionId,
        rewriteMode,
        selectedSwissDialect,
      );
      setRewrites(response.rewrites);
    } catch {
      setError('Style rewrite failed.');
    } finally {
      setRewriting(false);
    }
  };

  const handleSpeak = async (text: string) => {
    if (!text.trim() || speakingText) return;

    setSpeakingText(text);
    setError(null);
    try {
      await playSpeech(text, {
        style: speechStyleByRewriteMode[rewriteMode],
        model: speechModelByRewriteMode[rewriteMode],
        dialect: selectedSwissDialect,
      });
    } catch {
      setError('Audio could not be played.');
    } finally {
      setSpeakingText(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-white sm:text-3xl">Style</h1>
        <p className="text-slate-400 text-sm">
          Rewrite your sentences from a completed session.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
        <aside className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 bg-slate-900 border-b border-slate-700 flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-400" />
            <h2 className="font-semibold text-white text-sm">Choose session</h2>
          </div>

          {loadingSessions ? (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
              <Loader2 size={18} className="animate-spin mr-2" />
              Loading...
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">
              No completed sessions available.
            </div>
          ) : (
            <div className="max-h-[620px] overflow-y-auto divide-y divide-slate-700/70">
              {sessions.map(session => {
                const active = session.id === selectedSessionId;

                return (
                  <button
                    key={session.id}
                    onClick={() => {
                      setSelectedSessionId(session.id);
                      setRewrites([]);
                      setRewriteRequested(false);
                      setError(null);
                    }}
                    className={clsx(
                      'w-full text-left px-4 py-3 transition-colors',
                      active ? 'bg-blue-600/20' : 'hover:bg-slate-700/50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-white text-sm font-medium truncate">
                          {session.topic}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {formatDate(session.started_at)}
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">
                        {session.message_count}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="space-y-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <MessageSquareText size={17} className="text-cyan-300" />
                  {selectedSession ? selectedSession.topic : 'No session selected'}
                </div>
                {selectedSession && (
                  <div className="text-xs text-slate-400 mt-1">
                    {selectedSession.topic_category} · {formatDate(selectedSession.started_at)}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <div className="mb-1 px-1 text-xs font-semibold uppercase text-slate-500">
                    Style
                  </div>
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-xl p-1">
                    {rewriteModes.map(mode => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setRewriteMode(mode.value)}
                        disabled={rewriting}
                        className={clsx(
                          'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                          rewriteMode === mode.value
                            ? 'bg-cyan-500/20 text-cyan-200'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800',
                        )}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 px-1 text-xs font-semibold uppercase text-slate-500">
                    Swiss German
                  </div>
                  <div className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-700 rounded-xl p-1">
                    {swissDialects.map(dialect => (
                      <button
                        key={dialect}
                        type="button"
                        onClick={() => {
                          setRewriteMode('swiss_german');
                          setSwissDialect(dialect);
                        }}
                        disabled={rewriting}
                        className={clsx(
                          'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                          rewriteMode === 'swiss_german' && swissDialect === dialect
                            ? 'bg-cyan-500/20 text-cyan-200'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800',
                        )}
                      >
                        {dialect}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleRewrite}
                disabled={!selectedSessionId || rewriting}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-colors"
              >
                {rewriting
                  ? <><Loader2 size={15} className="animate-spin" /> Rewriting...</>
                  : <><Wand2 size={15} /> Improve style</>}
              </button>
            </div>

            {error && (
              <div className="mt-4 text-sm text-red-300 bg-red-950/40 border border-red-800 rounded-xl px-3 py-2">
                {error}
              </div>
            )}
          </div>

          {rewriting || loadingSaved ? (
            <div className="bg-slate-800 rounded-2xl border border-slate-700 h-56 flex items-center justify-center text-slate-300">
              <Loader2 size={22} className="animate-spin mr-2" />
              {rewriting ? 'Rewriting phrases...' : 'Loading saved rewrites...'}
            </div>
          ) : rewrites.length > 0 ? (
            <div className="space-y-3">
              {rewrites.map((rewrite, index) => (
                <RewriteRow
                  key={`${rewrite.message_id}-${index}`}
                  rewrite={rewrite}
                  index={index}
                  speakingText={speakingText}
                  onSpeak={handleSpeak}
                />
              ))}
            </div>
          ) : rewriteRequested && !error ? (
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-10 text-center">
              <Wand2 size={32} className="mx-auto mb-3 text-slate-500" />
              <div className="text-white font-semibold mb-1">
                No rewrite received
              </div>
              <p className="text-sm text-slate-400">
                Claude did not return usable style suggestions for this session.
              </p>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-10 text-center">
              <Wand2 size={32} className="mx-auto mb-3 text-slate-500" />
              <div className="text-white font-semibold mb-1">
                Choose a session
              </div>
              <p className="text-sm text-slate-400">
                Then you can have your own sentences rewritten for style.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const RewriteRow: React.FC<{
  rewrite: StyleRewriteItem;
  index: number;
  speakingText: string | null;
  onSpeak: (text: string) => void;
}> = ({ rewrite, index, speakingText, onSpeak }) => (
  <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
    <div className="px-4 py-2 bg-slate-900 border-b border-slate-700 flex items-center justify-between">
      <span className="text-xs font-semibold text-slate-300">
        Sentence {index + 1}
      </span>
      <div className="flex items-center gap-2">
        {rewrite.created_at && (
          <span className="text-xs text-slate-500">
            {formatDate(rewrite.created_at)}
          </span>
        )}
        {rewrite.register && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            {rewrite.register}
          </span>
        )}
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 p-4">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500 uppercase font-semibold">
            Corrected
          </div>
          <button
            type="button"
            onClick={() => onSpeak(rewrite.original)}
            disabled={speakingText !== null}
            title="Read corrected text aloud"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
          >
            {speakingText === rewrite.original
              ? <Loader2 size={14} className="animate-spin" />
              : <Volume2 size={14} />}
          </button>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          {rewrite.original}
        </p>
      </div>

      <div className="hidden md:flex items-center justify-center text-slate-500 px-1">
        <ArrowRight size={18} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500 uppercase font-semibold">
            Better
          </div>
          <button
            type="button"
            onClick={() => onSpeak(rewrite.rewritten)}
            disabled={speakingText !== null}
            title="Read rewrite aloud"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
          >
            {speakingText === rewrite.rewritten
              ? <Loader2 size={14} className="animate-spin" />
              : <Volume2 size={14} />}
          </button>
        </div>
        <p className="text-sm text-white leading-relaxed font-medium">
          {rewrite.rewritten}
        </p>
      </div>
    </div>
  </div>
);
