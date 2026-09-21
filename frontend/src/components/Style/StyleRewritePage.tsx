import React, { useEffect, useMemo, useState } from 'react';
import type { ConversationSession, Message, StyleRewriteItem, StyleRewriteMode, User } from '../../types';
import { getSavedStyleRewrites, getSessionMessages, getUserSessions, rewriteSessionStyle } from '../../api';
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
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
        setSelectedSessionId(null);
      } catch {
        setError('Sessions could not be loaded.');
      } finally {
        setLoadingSessions(false);
      }
    };

    loadSessions();
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setMessageError(null);
    if (selectedSessionId === null) return;
    setLoadingMessages(true);
    getSessionMessages(selectedSessionId)
      .then(result => { if (!cancelled) setMessages(result); })
      .catch(() => { if (!cancelled) setMessageError('The conversation could not be loaded. Please try another session or reload the page.'); })
      .finally(() => { if (!cancelled) setLoadingMessages(false); });
    return () => { cancelled = true; };
  }, [selectedSessionId, user.id]);

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

    let cancelled = false;
    const loadSavedRewrites = async () => {
      setRewrites([]);
      setLoadingSaved(true);
      setRewriteRequested(false);
      setError(null);
      try {
        const response = await getSavedStyleRewrites(
          selectedSessionId,
          rewriteMode,
          selectedSwissDialect,
        );
        if (!cancelled) setRewrites(response.rewrites);
      } catch {
        if (!cancelled) setError('Saved style rewrites could not be loaded.');
      } finally {
        if (!cancelled) setLoadingSaved(false);
      }
    };

    loadSavedRewrites();
    return () => { cancelled = true; };
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
                    disabled={rewriting}
                    aria-pressed={active}
                    onClick={() => {
                      if (active) return;
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

        <section className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
              <fieldset className="min-w-0">
                <legend className="mb-2 text-sm font-medium text-slate-300">Style</legend>
                <div className="flex flex-wrap gap-2">
                  {rewriteModes.map(mode => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setRewriteMode(mode.value)}
                      disabled={rewriting}
                      aria-pressed={rewriteMode === mode.value}
                      className={clsx(
                        'rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50',
                        rewriteMode === mode.value
                          ? 'bg-cyan-500/20 text-cyan-200'
                          : 'bg-slate-900 text-slate-400 hover:bg-slate-700 hover:text-white',
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="col-span-2 min-w-0">
                <legend className="mb-2 text-sm font-medium text-slate-300">Swiss German</legend>
                <div className="flex flex-wrap gap-2">
                  {swissDialects.map(dialect => (
                    <button
                      key={dialect}
                      type="button"
                      onClick={() => { setRewriteMode('swiss_german'); setSwissDialect(dialect); }}
                      disabled={rewriting}
                      aria-pressed={swissDialectSelected && swissDialect === dialect}
                      className={clsx(
                        'rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50',
                        swissDialectSelected && swissDialect === dialect
                          ? 'bg-cyan-500/20 text-cyan-200'
                          : 'bg-slate-900 text-slate-400 hover:bg-slate-700 hover:text-white',
                      )}
                    >
                      {dialect}
                    </button>
                  ))}
                </div>
              </fieldset>
              <button
                onClick={handleRewrite}
                disabled={!selectedSessionId || rewriting || loadingSaved}
                className="col-start-2 row-start-1 flex min-h-11 self-start items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rewriting ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                {rewriting ? 'Changing style…' : 'Change style'}
              </button>
            </div>
          </div>

          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

          {selectedSession && (
            <section aria-label="Selected conversation" className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800">
              <div className="border-b border-slate-700 px-5 py-4">
                <h2 className="flex items-center gap-2 font-semibold text-white">
                  <MessageSquareText size={17} className="shrink-0 text-slate-400" />
                  {selectedSession.topic}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedSession.topic_category} · {formatDate(selectedSession.started_at)}
                </p>
              </div>
              <div className="space-y-4 p-5">
                {(rewriting || loadingSaved) && (
                  <p role="status" className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 size={16} className="animate-spin" />
                    {rewriting ? 'Changing style…' : 'Loading saved rewrites…'}
                  </p>
                )}
                {messageError && <p role="alert" className="text-sm text-red-300">{messageError}</p>}
                {loadingMessages ? (
                  <p role="status" className="text-sm text-slate-400">Loading conversation…</p>
                ) : messages.length === 0 && !messageError ? (
                  <p className="text-sm text-slate-400">This session has no messages yet.</p>
                ) : messages.map((message, index) => {
                  const rewrite = rewrites.find(item => item.message_id === message.id);
                  return (
                    <div key={message.id}>
                      <p className="mb-2 text-xs font-semibold text-slate-400">{message.role === 'user' ? 'You' : 'Tutor'}</p>
                      {rewrite ? (
                        <RewriteRow rewrite={rewrite} index={index} speakingText={speakingText} onSpeak={handleSpeak} />
                      ) : (
                        <p className="whitespace-pre-wrap rounded-xl bg-slate-900/50 p-4 text-sm leading-relaxed text-slate-200">{message.corrected_content || message.content}</p>
                      )}
                    </div>
                  );
                })}
                {rewriteRequested && !rewriting && rewrites.length === 0 && !error && (
                  <p className="text-sm text-slate-400">No style suggestions were returned for this session.</p>
                )}
              </div>
            </section>
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
