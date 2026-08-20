import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Headphones, Keyboard, Loader2, Mic, MicOff, PhoneOff, Send, X } from 'lucide-react';
import { clsx } from 'clsx';

import {
  createOpeningMessage,
  createSession,
  deleteSession,
  endSession,
  getFreeConversationTopics,
  getSessionMessages,
  getTopics,
  streamMessage,
  transcribeAudio,
} from '../../api';
import type { DiscussionMode, Message, SelectedConversation, User } from '../../types';
import { createMediaRecorder, playSpeech, stopMediaStream } from '../../utils/audio';
import { RealtimeDiscussion, type RealtimeState } from '../../utils/realtime';
import { MessageBubble } from './MessageBubble';

interface Props { user: User; }

const VOICE_OPTIONS = [
  'marin',
  'cedar',
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
] as const;

export const ChatPage: React.FC<Props> = ({ user }) => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { topic } = ((location.state as { topic?: SelectedConversation }) || {});
  const routeId = sessionId && /^\d+$/.test(sessionId) ? Number(sessionId) : null;
  const topicText = topic
    ? topic.isFreeTopic ? topic.title : `${topic.title}: ${topic.starterTitle}. ${topic.starterPrompt}`
    : 'German conversation';

  const [activeSessionId, setActiveSessionId] = useState<number | null>(routeId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<DiscussionMode | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClose, setShowClose] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('ended');
  const [assistantDraft, setAssistantDraft] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [topicCategories, setTopicCategories] = useState<string[]>([]);
  const [saveCategoryMode, setSaveCategoryMode] = useState<'existing' | 'free' | 'custom'>('existing');
  const [selectedSaveCategory, setSelectedSaveCategory] = useState('');
  const [customSaveCategory, setCustomSaveCategory] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string>('marin');

  const createdRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamAbortRef = useRef<AbortController | null>(null);
  const realtimeRef = useRef<RealtimeDiscussion | null>(null);
  const userTurnsRef = useRef(0);

  useEffect(() => {
    if (activeSessionId || createdRef.current || !topic) return;
    createdRef.current = true;
    setBusy(true);
    createSession(topicText, topic.category)
      .then(session => {
        setActiveSessionId(session.id);
        navigate(`/chat/${session.id}`, { replace: true, state: { topic } });
      })
      .catch(() => setError('The conversation could not be created.'))
      .finally(() => setBusy(false));
  }, [activeSessionId, navigate, topic, topicText]);

  useEffect(() => {
    if (!routeId || topic) return;
    setBusy(true);
    getSessionMessages(routeId)
      .then(loaded => {
        setMessages(loaded);
        userTurnsRef.current = loaded.filter(message => message.role === 'user').length;
      })
      .catch(() => navigate('/topics', { replace: true }))
      .finally(() => setBusy(false));
  }, [navigate, routeId, topic]);

  useEffect(() => {
    if (!topic?.isFreeTopic) return;
    Promise.all([getTopics(), getFreeConversationTopics().catch(() => [])])
      .then(([predefined, saved]) => {
        const categories = Array.from(new Set([
          ...predefined.map(item => item.category),
          ...saved.map(item => item.category),
        ].filter(Boolean))).sort();
        setTopicCategories(categories);
        setSelectedSaveCategory(current => current || categories[0] || 'Free discussions');
      })
      .catch(() => {
        setTopicCategories([]);
        setSelectedSaveCategory('Free discussions');
      });
  }, [topic?.isFreeTopic]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, assistantDraft]);
  useEffect(() => () => {
    streamAbortRef.current?.abort();
    realtimeRef.current?.stop();
    stopMediaStream(microphoneRef.current);
  }, []);

  useEffect(() => {
    if (mode !== 'realtime' || remainingSeconds === null || remainingSeconds <= 0) return;
    const id = window.setInterval(() => setRemainingSeconds(value => value == null ? null : Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [mode, remainingSeconds === null]);

  const startControlled = async () => {
    if (!activeSessionId) return;
    realtimeRef.current?.stop();
    realtimeRef.current = null;
    setMode('controlled');
    setError(null);
    if (messages.length === 0) {
      setBusy(true);
      try {
        const opening = await createOpeningMessage(activeSessionId);
        setMessages([{ role: 'assistant', content: opening.reply }]);
      } catch {
        setError('The opening message could not be generated.');
      } finally {
        setBusy(false);
      }
    }
  };

  const closeRealtimeAtLimit = async () => {
    setError('The seven-minute voice limit was reached. Preparing your review…');
    await finishSession();
  };

  const startRealtime = async () => {
    if (!activeSessionId) return;
    setMode('realtime');
    setError(null);
    const connection = new RealtimeDiscussion(activeSessionId, messages.length, selectedVoice, {
      onState: setRealtimeState,
      onTranscript: message => {
        if (message.role === 'user') userTurnsRef.current += 1;
        setMessages(previous => [...previous, message]);
      },
      onAssistantDraft: setAssistantDraft,
      onError: message => setError(message),
      onTimeout: () => void closeRealtimeAtLimit(),
      onLimit: setRemainingSeconds,
    });
    realtimeRef.current = connection;
    try {
      await connection.start();
    } catch (startError) {
      if (startError instanceof Error && startError.name === 'AbortError') return;
      await startControlled();
      setError('Live voice was unavailable, so this session reopened in controlled mode.');
    }
  };

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy || !activeSessionId || mode !== 'controlled') return;
    setInput('');
    setError(null);
    setMessages(previous => [...previous, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setBusy(true);
    const controller = new AbortController();
    streamAbortRef.current = controller;
    let persistedUserMessageId: number | undefined;
    const handlers = {
      onSession: (data: { user_message_id: number }) => {
        if (persistedUserMessageId === undefined) userTurnsRef.current += 1;
        persistedUserMessageId = data.user_message_id;
      },
      onDelta: (delta: string) => setMessages(previous => {
        const next = [...previous];
        const last = next.length - 1;
        next[last] = { ...next[last], content: next[last].content + delta };
        return next;
      }),
      onError: setError,
    };
    try {
      try {
        await streamMessage(activeSessionId, text, controller.signal, handlers);
      } catch {
        if (!persistedUserMessageId || controller.signal.aborted) throw new Error('stream stopped');
        setMessages(previous => {
          const next = [...previous];
          next[next.length - 1] = { ...next[next.length - 1], content: '' };
          return next;
        });
        await streamMessage(
          activeSessionId,
          text,
          controller.signal,
          handlers,
          persistedUserMessageId,
        );
      }
    } catch (streamError) {
      if (!controller.signal.aborted) setError('The response stream stopped. Your message was saved; try again.');
    } finally {
      streamAbortRef.current = null;
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (busy || transcribing) return;
    try {
      const { recorder, stream, chunks } = await createMediaRecorder();
      recorderRef.current = recorder;
      microphoneRef.current = stream;
      chunksRef.current = chunks;
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stopMediaStream(microphoneRef.current);
        microphoneRef.current = null;
        setTranscribing(true);
        try {
          const result = await transcribeAudio(blob);
          await sendText(result.text);
        } catch {
          setError('Audio could not be transcribed.');
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start(250);
      setRecording(true);
    } catch {
      setError('Microphone access failed.');
    }
  };

  const finishSession = async () => {
    if (!activeSessionId || busy) return;
    setBusy(true);
    streamAbortRef.current?.abort();
    if (realtimeRef.current) {
      realtimeRef.current.stop();
      await realtimeRef.current.flush(5000);
      realtimeRef.current = null;
    }
    try {
      if (userTurnsRef.current === 0) {
        await deleteSession(activeSessionId);
        navigate('/topics');
        return;
      }
      const saveCategory = topic?.isFreeTopic
        ? saveCategoryMode === 'free'
          ? 'Free discussions'
          : saveCategoryMode === 'custom'
            ? customSaveCategory.trim() || 'Free discussions'
            : selectedSaveCategory || 'Free discussions'
        : topic?.category;
      await endSession(activeSessionId, saveCategory);
      navigate(`/sessions/${activeSessionId}/review`, { replace: true });
    } catch {
      setError('The session could not be closed. Please retry.');
      setBusy(false);
      setShowClose(false);
    }
  };

  const discardSession = async () => {
    if (!activeSessionId) return navigate('/topics');
    setBusy(true);
    realtimeRef.current?.stop();
    await deleteSession(activeSessionId);
    navigate('/topics');
  };

  const statusLabel = realtimeState === 'connecting' ? 'Connecting…'
    : realtimeState === 'speaking' ? 'Tutor speaking — interrupt at any time'
      : realtimeState === 'thinking' ? 'Thinking…' : 'Listening';

  return (
    <div className="mx-auto flex max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-800" style={{ height: 'calc(100vh - 8rem)' }}>
      <header className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-5 py-3">
        <div>
          <div className="font-semibold text-white">{topic?.title ?? 'Conversation'}</div>
          <div className="text-xs text-slate-400">{user.level} · Feedback stays hidden until the review</div>
        </div>
        <div className="flex items-center gap-3">
          {mode === 'controlled' && (
            <label className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
              Voice
              <select
                value={selectedVoice}
                onChange={event => setSelectedVoice(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs capitalize text-white outline-none focus:border-blue-500"
              >
                {VOICE_OPTIONS.map(voice => <option key={voice} value={voice}>{voice}</option>)}
              </select>
            </label>
          )}
          <button onClick={() => setShowClose(true)} className="rounded-lg bg-red-700 px-4 py-2 text-sm hover:bg-red-600">Close</button>
        </div>
      </header>

      {!mode ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-2xl">
            <h1 className="text-center text-2xl font-semibold">How would you like to talk?</h1>
            <p className="mt-2 text-center text-sm text-slate-400">Both modes receive the same detailed review after the session.</p>
            <div className="mx-auto mt-6 max-w-xs">
              <label className="block text-sm font-medium text-slate-200" htmlFor="discussion-voice">Tutor voice</label>
              <select
                id="discussion-voice"
                value={selectedVoice}
                onChange={event => setSelectedVoice(event.target.value)}
                disabled={busy}
                className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm capitalize text-white outline-none focus:border-blue-500 disabled:opacity-40"
              >
                {VOICE_OPTIONS.map(voice => <option key={voice} value={voice}>{voice}</option>)}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">Used for live voice and optional text-to-speech. Voices are AI-generated.</p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <button onClick={startRealtime} disabled={!activeSessionId || busy} className="rounded-2xl border border-cyan-600/60 bg-cyan-950/40 p-6 text-left hover:bg-cyan-950/70 disabled:opacity-40">
                <Headphones className="mb-4 text-cyan-300" />
                <div className="font-semibold">Fluid voice</div>
                <div className="mt-2 text-sm text-slate-300">Natural hands-free speech, automatic turns and interruptions. Voice only, up to seven minutes.</div>
              </button>
              <button onClick={startControlled} disabled={!activeSessionId || busy} className="rounded-2xl border border-blue-600/60 bg-blue-950/40 p-6 text-left hover:bg-blue-950/70 disabled:opacity-40">
                <Keyboard className="mb-4 text-blue-300" />
                <div className="font-semibold">Controlled</div>
                <div className="mt-2 text-sm text-slate-300">Type or push to talk. Fast streamed text replies; audio playback only when requested.</div>
              </button>
            </div>
            {error && <p className="mt-5 text-center text-sm text-red-300">{error}</p>}
          </div>
        </div>
      ) : mode === 'realtime' ? (
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className={clsx('flex h-36 w-36 items-center justify-center rounded-full border-4 transition-all', realtimeState === 'speaking' ? 'animate-pulse border-cyan-400 bg-cyan-500/20' : 'border-blue-400 bg-blue-500/10')}>
            {realtimeState === 'connecting' ? <Loader2 className="animate-spin" size={44} /> : <Mic size={44} />}
          </div>
          <div className="mt-5 text-lg font-medium">{statusLabel}</div>
          {remainingSeconds !== null && <div className="mt-1 text-sm text-slate-400">{Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')} remaining</div>}
          {error && <div className="mt-4 rounded-lg bg-red-950/60 px-4 py-2 text-sm text-red-200">{error}</div>}
          <button onClick={() => setShowTranscript(value => !value)} className="mt-6 text-sm text-cyan-300 hover:text-cyan-200">{showTranscript ? 'Hide transcript' : 'Show transcript'}</button>
          {showTranscript && (
            <div className="mt-3 max-h-52 w-full max-w-xl overflow-y-auto rounded-xl bg-slate-900 p-4">
              {messages.map((message, index) => <p key={message.id ?? index} className="mb-2 text-sm"><span className="font-semibold text-slate-400">{message.role === 'user' ? 'You' : 'Tutor'}:</span> {message.content}</p>)}
              {assistantDraft && <p className="text-sm text-slate-300"><span className="font-semibold text-slate-400">Tutor:</span> {assistantDraft}</p>}
            </div>
          )}
          <button onClick={() => setShowClose(true)} className="mt-8 flex items-center gap-2 rounded-xl bg-red-700 px-5 py-3 hover:bg-red-600"><PhoneOff size={18} /> End voice session</button>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {messages.map((message, index) => (
              <MessageBubble key={message.id ?? index} message={message} showFeedback={false} onSpeak={message.role === 'assistant' && !busy ? text => void playSpeech(text, { voice: selectedVoice }).catch(() => setError('Audio could not be played.')) : undefined} />
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Claude is writing…</div>}
            <div ref={bottomRef} />
          </div>
          <div className="border-t border-slate-700 bg-slate-900 p-4">
            <div className="flex items-end gap-3">
              <textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendText(input); } }} disabled={busy || transcribing} rows={2} placeholder="Write in German…" className="flex-1 resize-none rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-sm outline-none focus:border-blue-500" />
              <button onClick={toggleRecording} disabled={busy || transcribing} className={clsx('rounded-xl p-3', recording ? 'bg-red-600' : 'bg-slate-700', (busy || transcribing) && 'opacity-40')} title="Push to talk">{transcribing ? <Loader2 size={18} className="animate-spin" /> : recording ? <MicOff size={18} /> : <Mic size={18} />}</button>
              <button onClick={() => void sendText(input)} disabled={!input.trim() || busy || transcribing} className="rounded-xl bg-blue-600 p-3 disabled:opacity-40"><Send size={18} /></button>
            </div>
            <div className={clsx('mt-2 text-xs', error ? 'text-red-300' : 'text-slate-500')}>{error ?? (recording ? 'Recording… press again to send.' : 'Type or push to talk. Use the speaker button only when you want audio.')}</div>
          </div>
        </>
      )}

      {showClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">End this conversation?</h2><p className="mt-1 text-sm text-slate-400">Saving opens the review immediately while analysis finishes in the background.</p></div><button onClick={() => setShowClose(false)}><X size={18} /></button></div>
            {topic?.isFreeTopic && userTurnsRef.current > 0 && (
              <div className="mt-5 rounded-xl border border-slate-700 bg-slate-800 p-4">
                <div className="text-sm font-semibold text-white">Save this free topic under</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSaveCategoryMode('existing')}
                    className={clsx('rounded-lg px-2 py-2 text-xs transition-colors', saveCategoryMode === 'existing' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700')}
                  >
                    Existing category
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveCategoryMode('free')}
                    className={clsx('rounded-lg px-2 py-2 text-xs transition-colors', saveCategoryMode === 'free' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700')}
                  >
                    Free discussions
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveCategoryMode('custom')}
                    className={clsx('rounded-lg px-2 py-2 text-xs transition-colors', saveCategoryMode === 'custom' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700')}
                  >
                    New category
                  </button>
                </div>
                {saveCategoryMode === 'existing' && (
                  <select
                    value={selectedSaveCategory}
                    onChange={event => setSelectedSaveCategory(event.target.value)}
                    className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  >
                    {topicCategories.map(category => <option key={category} value={category}>{category}</option>)}
                    {topicCategories.length === 0 && <option value="Free discussions">Free discussions</option>}
                  </select>
                )}
                {saveCategoryMode === 'custom' && (
                  <input
                    value={customSaveCategory}
                    onChange={event => setCustomSaveCategory(event.target.value)}
                    maxLength={120}
                    placeholder="New category name"
                    className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
                  />
                )}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setShowClose(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-sm">Cancel</button><button onClick={() => void discardSession()} disabled={busy} className="rounded-lg bg-slate-700 px-4 py-2 text-sm disabled:opacity-40">Discard</button><button onClick={() => void finishSession()} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium disabled:opacity-40">{busy ? 'Closing…' : 'Save & review'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
};
