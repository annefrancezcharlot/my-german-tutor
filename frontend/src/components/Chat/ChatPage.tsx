import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  createOpeningMessage,
  createSession,
  deleteSession,
  endSession,
  getSessionMessages,
  getTopics,
  sendMessage,
  transcribeAudio,
} from '../../api';
import type { User, Message, ErrorDetail, SelectedConversation, Topic } from '../../types';
import { Mic, MicOff, Send, Loader2, PanelRightOpen, PanelRightClose, X } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { CorrectionPanel } from './CorrectionPanel';
import { clsx } from 'clsx';
import { createMediaRecorder, playSpeech, stopMediaStream } from '../../utils/audio';

interface Props { user: User; }

export const ChatPage: React.FC<Props> = ({ user }) => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { topic } = ((location.state as { topic?: SelectedConversation }) || {});
  const routeSessionId = sessionId && /^\d+$/.test(sessionId) ? Number(sessionId) : null;
  const hasInvalidRouteSessionId = Boolean(
    sessionId && (!routeSessionId || !Number.isSafeInteger(routeSessionId))
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastCorrections, setLastCorrections] = useState<ErrorDetail[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [ending, setEnding] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(routeSessionId);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [sessionScore, setSessionScore] = useState<number | null>(null);
  const [totalErrors, setTotalErrors] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [topicCategories, setTopicCategories] = useState<string[]>([]);
  const [saveCategoryMode, setSaveCategoryMode] = useState<'existing' | 'free' | 'custom'>('existing');
  const [selectedSaveCategory, setSelectedSaveCategory] = useState(topic?.category || 'Free discussions');
  const [customSaveCategory, setCustomSaveCategory] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navGuardArmedRef = useRef(false);
  const openingRequestedRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const conversationTopicText = topic
    ? topic.isFreeTopic
      ? topic.title
      : `${topic.title}: ${topic.starterTitle}. ${topic.starterPrompt}`
    : undefined;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    if (hasInvalidRouteSessionId || !routeSessionId) {
      navigate('/topics', { replace: true });
      return;
    }

    if (topic) {
      setActiveSessionId(routeSessionId);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setAudioError(null);
    setActiveSessionId(routeSessionId);

    getSessionMessages(routeSessionId)
      .then((loadedMessages) => {
        if (cancelled) return;
        setMessages(loadedMessages);
        setMessageCount(loadedMessages.filter(message => message.role === 'user').length);
        setTotalErrors(loadedMessages.filter(message => message.has_errors).length);
      })
      .catch(() => {
        if (!cancelled) {
          navigate('/topics', { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          inputRef.current?.focus();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasInvalidRouteSessionId, navigate, routeSessionId, sessionId, topic]);

  useEffect(() => {
    if (!topic || activeSessionId || openingRequestedRef.current) return;

    openingRequestedRef.current = true;
    setLoading(true);
    setAudioError(null);

    const startConversation = async () => {
      try {
        const session = await createSession(
          conversationTopicText ?? topic.title,
          topic.category,
        );
        setActiveSessionId(session.id);
        navigate(`/chat/${session.id}`, { replace: true, state: { topic } });

        const opening = await createOpeningMessage(session.id);
        setMessages([{ role: 'assistant', content: opening.reply }]);
      } catch {
        setMessages([
          { role: 'assistant', content: 'Ich konnte das Gespräch gerade nicht starten. Versuch es bitte noch einmal.' },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    };

    startConversation();
  }, [activeSessionId, conversationTopicText, navigate, topic, user.id]);

  useEffect(() => {
    getTopics()
      .then((items: Topic[]) => {
        const categories = Array.from(new Set(items.map(item => item.category))).sort();
        setTopicCategories(categories);
        if (!topic?.category || topic.category === 'Free discussions') {
          setSelectedSaveCategory(categories[0] ?? 'Free discussions');
        }
      })
      .catch(() => {
        setTopicCategories([]);
      });
  }, [topic?.category]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (messageCount === 0 || ending) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [messageCount, ending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      stopMediaStream(streamRef.current);
    };
  }, []);

  useEffect(() => {
    if (messageCount === 0 || ending) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;

      const nextUrl = new URL(anchor.href, window.location.origin);
      const currentUrl = new URL(window.location.href);

      if (
        nextUrl.origin !== currentUrl.origin ||
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search &&
        nextUrl.hash === currentUrl.hash
      ) {
        return;
      }

      event.preventDefault();
      setPendingRoute(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      setShowCloseModal(true);
    };

    const handlePopState = () => {
      if (!navGuardArmedRef.current || ending || messageCount === 0) return;
      navGuardArmedRef.current = false;
      setPendingRoute('__back__');
      setShowCloseModal(true);
    };

    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [ending, location.pathname, messageCount]);

  useEffect(() => {
    if (messageCount > 0 && !navGuardArmedRef.current) {
      window.history.pushState({ chatGuard: true }, '', window.location.href);
      navGuardArmedRef.current = true;
    }
  }, [messageCount]);

  /* ── Send message ───────────────────────────────────────────────── */
  const sendText = async (text: string) => {
    if (!text.trim() || loading) return;
    const userText = text.trim();
    setInput('');
    setAudioError(null);

    const userMsg: Message = { role: 'user', content: userText };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const response = await sendMessage(
        activeSessionId,
        userText,
        history,
        conversationTopicText,
        topic?.category,
      );
      if (!activeSessionId) {
        setActiveSessionId(response.session_id);
        navigate(`/chat/${response.session_id}`, { replace: true, state: { topic } });
      }

      // Update user message with correction metadata
      setMessages(prev => {
        const updated = [...prev];
        const lastUserIdx = [...updated].reverse().findIndex(m => m.role === 'user');
        if (lastUserIdx !== -1) {
          const realIdx = updated.length - 1 - lastUserIdx;
          updated[realIdx] = {
            ...updated[realIdx],
            has_errors: response.has_errors,
            corrected_content: response.corrected_user_message ?? undefined,
          };
        }
        return [
          ...updated,
          { role: 'assistant', content: response.reply },
        ];
      });

      if (response.corrections.length > 0) {
        setLastCorrections(response.corrections);
        setShowPanel(true);
        setTotalErrors(prev => prev + response.corrections.length);
      } else {
        setLastCorrections([]);
      }

      if (response.session_score != null) {
        setSessionScore(prev =>
          prev === null
            ? response.session_score!
            : Math.round((prev + response.session_score!) / 2)
        );
      }
      setMessageCount(prev => prev + 1);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSend = async () => {
    await sendText(input);
  };

  const startRecording = async () => {
    if (recording || transcribing || loading) return;

    setAudioError(null);
    try {
      const { recorder, stream, chunks } = await createMediaRecorder();
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = chunks;

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        stopMediaStream(streamRef.current);
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        setRecording(false);

        if (audioBlob.size === 0) return;

        setTranscribing(true);
        try {
          const result = await transcribeAudio(audioBlob);
          if (result.text.trim()) {
            await sendText(result.text);
          } else {
            setAudioError('No speech detected.');
          }
        } catch {
          setAudioError('Audio could not be transcribed.');
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start(250);
      setRecording(true);
    } catch {
      setAudioError('Microphone could not be started.');
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.requestData();
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  /* ── End session ─────────────────────────────────────────────────── */
  const handleSaveAndClose = async () => {
    if (ending) return;
    if (messageCount === 0 || !activeSessionId) {
      if (pendingRoute === '__back__') {
        window.history.back();
      } else if (pendingRoute) {
        navigate(pendingRoute);
      } else {
        navigate('/topics');
      }
      setPendingRoute(null);
      setShowCloseModal(false);
      return;
    }

    setEnding(true);
    try {
      const categoryToSave =
        saveCategoryMode === 'free'
          ? 'Free discussions'
          : saveCategoryMode === 'custom'
            ? customSaveCategory.trim() || 'Free discussions'
            : selectedSaveCategory;
      const result = await endSession(activeSessionId, categoryToSave);
      if (pendingRoute === '__back__') {
        navigate('/dashboard', { state: { sessionSummary: result } });
      } else if (pendingRoute) {
        navigate(pendingRoute, {
          state: pendingRoute === '/dashboard' ? { sessionSummary: result } : undefined,
        });
      } else {
        navigate('/dashboard', { state: { sessionSummary: result } });
      }
    } finally {
      setEnding(false);
      setShowCloseModal(false);
      setPendingRoute(null);
    }
  };

  const handleDiscardAndClose = async () => {
    if (ending) return;

    setEnding(true);
    try {
      if (activeSessionId) {
        await deleteSession(activeSessionId);
      }
      if (pendingRoute === '__back__') {
        window.history.back();
      } else if (pendingRoute) {
        navigate(pendingRoute);
      } else {
        navigate('/topics');
      }
    } finally {
      setEnding(false);
      setShowCloseModal(false);
      setPendingRoute(null);
    }
  };

  const handleCloseModal = () => {
    if (messageCount > 0 && !navGuardArmedRef.current) {
      window.history.pushState({ chatGuard: true }, '', window.location.href);
      navGuardArmedRef.current = true;
    }
    setShowCloseModal(false);
    setPendingRoute(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ── Score colour helper ─────────────────────────────────────────── */
  const scoreColour = (s: number) =>
    s >= 80 ? 'text-green-400' : s >= 60 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="flex gap-4" style={{ height: 'calc(100vh - 8rem)' }}>

      {/* ── Main chat column ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden min-w-0">

        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-700 px-5 py-3 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="font-semibold text-white truncate">
              {topic?.title ?? 'Conversation'}
            </div>
            <div className="text-xs text-slate-400">
              {topic?.category} &nbsp;·&nbsp; {user.level} &nbsp;·&nbsp;
              {messageCount} messages &nbsp;·&nbsp;
              <span className="text-amber-400">{totalErrors} mistakes</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 ml-4">
            {/* Rolling score */}
            {sessionScore !== null && (
              <div className="text-sm hidden sm:flex items-center gap-1">
                <span className="text-slate-400">Current score:</span>
                <span className={clsx('font-bold', scoreColour(sessionScore))}>
                  {Math.round(sessionScore)}
                </span>
              </div>
            )}

            {/* Toggle correction panel */}
            <button
              onClick={() => setShowPanel(p => !p)}
              title="Corrections"
              className={clsx(
                'p-2 rounded-lg transition-colors',
                showPanel
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-white'
              )}
            >
              {showPanel
                ? <PanelRightClose size={18} />
                : <PanelRightOpen size={18} />}
            </button>

            {/* End button */}
            <button
              onClick={() => setShowCloseModal(true)}
              disabled={ending}
              className="bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
            >
              {ending && <Loader2 size={14} className="animate-spin" />}
              Close
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              message={msg}
              onSpeak={!loading ? text => {
                playSpeech(text, {
                  style: 'natural conversational German',
                }).catch(() => setAudioError('Audio could not be played.'));
              } : undefined}
            />
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 pl-1">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm italic">Claude is writing...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-slate-700 p-4 shrink-0 bg-slate-900">
          <div className="flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write in German... (Enter to send · Shift+Enter for a line break)"
              rows={2}
              disabled={loading || transcribing}
              className="flex-1 bg-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm resize-none border border-slate-600 focus:outline-none focus:border-blue-500 transition-colors leading-relaxed"
            />
            <button
              type="button"
              onClick={toggleRecording}
              disabled={loading || transcribing}
              title={recording ? 'Stop recording' : 'Record voice message'}
              className={clsx(
                'p-3 rounded-xl transition-colors shrink-0',
                recording
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600',
                (loading || transcribing) && 'cursor-not-allowed opacity-40',
              )}
            >
              {transcribing
                ? <Loader2 size={18} className="animate-spin" />
                : recording
                  ? <MicOff size={18} />
                  : <Mic size={18} />}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || loading || transcribing}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white p-3 rounded-xl transition-colors shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
          <div className={clsx(
            'text-xs mt-1.5 pl-1',
            audioError ? 'text-red-300' : recording ? 'text-red-300' : 'text-slate-500',
          )}>
            {audioError || (recording
              ? 'Recording... click again to send.'
              : transcribing
                ? 'Transcribing audio...'
                : 'Tip: Write or speak full sentences for better feedback.')}
          </div>
        </div>
      </div>

      {/* ── Correction side panel ─────────────────────────────────────── */}
      {showPanel && (
        <CorrectionPanel
          corrections={lastCorrections}
          onClose={() => setShowPanel(false)}
        />
      )}

      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Close conversation?</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {messageCount > 0
                    ? 'Would you like to save or discard this conversation?'
                    : 'This conversation has no messages from you yet and will not be saved.'}
                </p>
              </div>
              <button
                onClick={handleCloseModal}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              {messageCount > 0 && (
                <div className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-800 p-3">
                  <div className="mb-2 text-sm font-semibold text-white">Save under</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setSaveCategoryMode('existing')}
                      className={clsx(
                        'rounded-lg px-3 py-2 text-sm transition-colors',
                        saveCategoryMode === 'existing'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                      )}
                    >
                      Existing category
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveCategoryMode('free')}
                      className={clsx(
                        'rounded-lg px-3 py-2 text-sm transition-colors',
                        saveCategoryMode === 'free'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                      )}
                    >
                      Free discussions
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveCategoryMode('custom')}
                      className={clsx(
                        'rounded-lg px-3 py-2 text-sm transition-colors',
                        saveCategoryMode === 'custom'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                      )}
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
                      {topicCategories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                      {topicCategories.length === 0 && (
                        <option value="Free discussions">Free discussions</option>
                      )}
                    </select>
                  )}

                  {saveCategoryMode === 'custom' && (
                    <input
                      value={customSaveCategory}
                      onChange={event => setCustomSaveCategory(event.target.value)}
                      placeholder="New category name"
                      className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
                    />
                  )}
                </div>
              )}

              <button
                onClick={handleCloseModal}
                disabled={ending}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              {messageCount > 0 && (
                <button
                  onClick={handleDiscardAndClose}
                  disabled={ending}
                  className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
                >
                  Do not save
                </button>
              )}
              <button
                onClick={messageCount > 0 ? handleSaveAndClose : handleDiscardAndClose}
                disabled={ending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {messageCount > 0 ? 'Save' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
