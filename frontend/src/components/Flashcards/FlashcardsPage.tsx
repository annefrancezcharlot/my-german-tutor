import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookMarked, Layers, Loader2, MessageSquare, Mic, MicOff, Sparkles, Volume2 } from 'lucide-react';
import { clsx } from 'clsx';
import {
  generateFlashcardSet,
  getPronunciationFeedback,
  getFlashcardSet,
  getFlashcardSets,
  getFlashcardStudySession,
  saveFlashcardSession,
} from '../../api';
import type {
  Flashcard,
  FlashcardReviewRating,
  FlashcardSet,
  FlashcardSetSummary,
  FlashcardStudyMode,
  FlashcardStudySummary,
  PronunciationFeedbackResponse,
  SelectedConversation,
  User,
} from '../../types';
import { createMediaRecorder, playSpeech, stopMediaStream } from '../../utils/audio';

type DetailTab = 'example' | 'cases' | 'tenses';
type CardStartSide = 'front' | 'back';

const detailLabels: Record<DetailTab, string> = {
  example: 'Example',
  cases: 'Cases',
  tenses: 'Tenses',
};

const reviewOptions: Array<{
  rating: FlashcardReviewRating;
  label: string;
  hint: string;
  className: string;
}> = [
  {
    rating: 'again',
    label: 'Again',
    hint: 'returns soon',
    className: 'border-red-500/60 text-red-100 hover:bg-red-900/40',
  },
  {
    rating: 'hard',
    label: 'Hard',
    hint: 'returns later',
    className: 'border-amber-500/60 text-amber-100 hover:bg-amber-900/40',
  },
  {
    rating: 'good',
    label: 'Good',
    hint: 'remove from queue',
    className: 'border-green-500/60 text-green-100 hover:bg-green-900/40',
  },
  {
    rating: 'easy',
    label: 'Easy',
    hint: 'remove from queue',
    className: 'border-blue-500/60 text-blue-100 hover:bg-blue-900/40',
  },
];

const studyModeLabels: Record<FlashcardStudyMode, string> = {
  due_new: 'Due + new',
  due: 'Due only',
  all: 'Full deck',
};

const cardStartSideLabels: Record<CardStartSide, string> = {
  front: 'German first',
  back: 'English first',
};

const maxSessionRepeats: Partial<Record<FlashcardReviewRating, number>> = {
  again: 2,
  hard: 1,
};

const hasDetails = (card: Flashcard, tab: DetailTab): boolean => {
  if (tab === 'example') return !!card.example;
  if (tab === 'cases') return !!card.case_examples && Object.keys(card.case_examples).length > 0;
  return !!card.tense_examples && Object.keys(card.tense_examples).length > 0;
};

interface Props {
  user: User;
}

export const FlashcardsPage: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  const [sets, setSets] = useState<FlashcardSetSummary[]>([]);
  const [selectedSet, setSelectedSet] = useState<FlashcardSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSet, setLoadingSet] = useState(false);
  const [generatingSet, setGeneratingSet] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [lastSavedCount, setLastSavedCount] = useState(0);
  const [initialQueueCount, setInitialQueueCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [studyQueueIds, setStudyQueueIds] = useState<string[]>([]);
  const [repeatQueueIds, setRepeatQueueIds] = useState<string[]>([]);
  const [repeatCountByCard, setRepeatCountByCard] = useState<Record<string, number>>({});
  const [showBack, setShowBack] = useState(false);
  const [cardStartSide, setCardStartSide] = useState<CardStartSide>('front');
  const [detailTab, setDetailTab] = useState<DetailTab>('example');
  const [studyMode, setStudyMode] = useState<FlashcardStudyMode>('due_new');
  const [studySummary, setStudySummary] = useState<FlashcardStudySummary | null>(null);
  const [sessionTags, setSessionTags] = useState<Record<string, FlashcardReviewRating>>({});
  const [generateTopic, setGenerateTopic] = useState('');
  const [generatePreciseTopic, setGeneratePreciseTopic] = useState('');
  const [generateCount, setGenerateCount] = useState(12);
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [pronunciationRecording, setPronunciationRecording] = useState(false);
  const [pronunciationLoading, setPronunciationLoading] = useState(false);
  const [pronunciationFeedback, setPronunciationFeedback] = useState<PronunciationFeedbackResponse | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const pronunciationRecorderRef = useRef<MediaRecorder | null>(null);
  const pronunciationStreamRef = useRef<MediaStream | null>(null);
  const pronunciationChunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    const loadSets = async () => {
      setLoading(true);
      setError(null);
      try {
        setSets(await getFlashcardSets());
      } catch {
        setError('Flashcards could not be loaded.');
      } finally {
        setLoading(false);
      }
    };

    loadSets();
  }, []);

  const currentCard = useMemo(
    () => selectedSet?.cards.find(card => card.id === (studyQueueIds[0] ?? repeatQueueIds[0])),
    [repeatQueueIds, selectedSet, studyQueueIds],
  );
  const activeQueueCount = studyQueueIds.length + repeatQueueIds.length;
  const completedCount = Math.max(0, initialQueueCount - activeQueueCount);
  const progressLabel = initialQueueCount > 0
    ? `${completedCount} / ${initialQueueCount}`
    : '0 / 0';
  const unsavedCount = Object.keys(sessionTags).length;
  const initialShowBack = cardStartSide === 'back';
  const visibleCardText = currentCard
    ? showBack
      ? currentCard.back
      : currentCard.front
    : '';
  const visibleCardAudioStyle = showBack
    ? 'clear natural English pronunciation'
    : 'slow clear German pronunciation';

  useEffect(() => {
    return () => {
      stopMediaStream(pronunciationStreamRef.current);
    };
  }, []);

  useEffect(() => {
    if (studyQueueIds.length > 0 || repeatQueueIds.length === 0) return;

    setStudyQueueIds(repeatQueueIds);
    setRepeatQueueIds([]);
    setShowBack(initialShowBack);
    setDetailTab('example');
    setPronunciationFeedback(null);
  }, [initialShowBack, repeatQueueIds, studyQueueIds.length]);

  const loadStudyQueue = async (setId: string, mode: FlashcardStudyMode) => {
    const studySession = await getFlashcardStudySession(setId, mode);
    setStudySummary(studySession.summary);
    setStudyQueueIds(studySession.cards.map(card => card.id));
    setRepeatQueueIds([]);
    setRepeatCountByCard({});
    setInitialQueueCount(studySession.cards.length);
    setPronunciationFeedback(null);
  };

  const openSet = async (setId: string) => {
    setLoadingSet(true);
    setError(null);
    try {
      const [nextSet, studySession] = await Promise.all([
        getFlashcardSet(setId),
        getFlashcardStudySession(setId, 'due_new'),
      ]);

      setSelectedSet(nextSet);
      setStudySummary(studySession.summary);
      setSessionTags({});
      setLastSavedCount(0);
      setStudyMode('due_new');
      setStudyQueueIds(studySession.cards.map(card => card.id));
      setRepeatQueueIds([]);
      setRepeatCountByCard({});
      setInitialQueueCount(studySession.cards.length);
      setShowBack(initialShowBack);
      setDetailTab('example');
      setPronunciationFeedback(null);
    } catch {
      setError('This flashcard set could not be loaded.');
    } finally {
      setLoadingSet(false);
    }
  };

  const handleGenerateSet = async () => {
    const topic = generateTopic.trim();
    const preciseTopic = generatePreciseTopic.trim();
    if (!topic || generatingSet) return;

    setGeneratingSet(true);
    setError(null);
    try {
      const generated = await generateFlashcardSet(
        topic,
        preciseTopic || undefined,
        Math.min(30, Math.max(3, generateCount || 12)),
      );
      const nextSets = await getFlashcardSets();
      setSets(nextSets);
      setGenerateTopic('');
      setGeneratePreciseTopic('');
      await openSet(generated.id);
    } catch {
      setError('Flashcard set could not be generated.');
    } finally {
      setGeneratingSet(false);
    }
  };

  const speakText = async (text?: string, style = 'slow clear German pronunciation') => {
    if (!text?.trim() || speakingText) return;

    const cleanText = text.trim();
    setSpeakingText(cleanText);
    setAudioError(null);
    try {
      await playSpeech(cleanText, { style });
    } catch {
      setAudioError('Audio could not be played.');
    } finally {
      setSpeakingText(null);
    }
  };

  const stopPronunciationRecording = () => {
    if (pronunciationRecorderRef.current?.state === 'recording') {
      pronunciationRecorderRef.current.requestData();
      pronunciationRecorderRef.current.stop();
    }
    setPronunciationRecording(false);
  };

  const startPronunciationRecording = async () => {
    const targetText = visibleCardText.trim();
    if (!currentCard || !targetText || pronunciationRecording || pronunciationLoading) return;

    setAudioError(null);
    setPronunciationFeedback(null);
    try {
      const { recorder, stream, chunks } = await createMediaRecorder();
      pronunciationRecorderRef.current = recorder;
      pronunciationStreamRef.current = stream;
      pronunciationChunksRef.current = chunks;

      recorder.onstop = async () => {
        const audioBlob = new Blob(pronunciationChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        stopMediaStream(pronunciationStreamRef.current);
        pronunciationStreamRef.current = null;
        pronunciationRecorderRef.current = null;
        pronunciationChunksRef.current = [];
        setPronunciationRecording(false);

        if (audioBlob.size === 0) return;

        setPronunciationLoading(true);
        try {
          const feedback = await getPronunciationFeedback(targetText, audioBlob);
          setPronunciationFeedback(feedback);
        } catch {
          setAudioError('Pronunciation feedback could not be created.');
        } finally {
          setPronunciationLoading(false);
        }
      };

      recorder.start(250);
      setPronunciationRecording(true);
    } catch {
      setAudioError('Microphone could not be started.');
      stopMediaStream(pronunciationStreamRef.current);
      pronunciationStreamRef.current = null;
      pronunciationRecorderRef.current = null;
      setPronunciationRecording(false);
    }
  };

  const togglePronunciationRecording = () => {
    if (pronunciationRecording) {
      stopPronunciationRecording();
    } else {
      startPronunciationRecording();
    }
  };

  const moveCard = (direction: 1 | -1) => {
    if (!selectedSet || activeQueueCount <= 1) return;

    if (studyQueueIds.length > 0) {
      setStudyQueueIds(prev => {
        if (direction === 1) {
          return [...prev.slice(1), prev[0]];
        }
        return [prev[prev.length - 1], ...prev.slice(0, -1)];
      });
    } else {
      setRepeatQueueIds(prev => {
        if (direction === 1) {
          return [...prev.slice(1), prev[0]];
        }
        return [prev[prev.length - 1], ...prev.slice(0, -1)];
      });
    }
    setShowBack(initialShowBack);
    setDetailTab('example');
    setPronunciationFeedback(null);
  };

  const handleReview = (rating: FlashcardReviewRating) => {
    if (!selectedSet || !currentCard) return;

    setError(null);
    setLastSavedCount(0);
    setSessionTags(prev => ({
      ...prev,
      [currentCard.id]: rating,
    }));
    if (studyQueueIds[0] === currentCard.id) {
      setStudyQueueIds(prev => prev.slice(1));
    } else {
      setRepeatQueueIds(prev => prev[0] === currentCard.id
        ? prev.slice(1)
        : prev.filter(cardId => cardId !== currentCard.id));
    }
    const maxRepeats = maxSessionRepeats[rating] ?? 0;
    const currentRepeats = repeatCountByCard[currentCard.id] ?? 0;
    if (maxRepeats > 0 && currentRepeats < maxRepeats) {
      setRepeatQueueIds(prev => prev.includes(currentCard.id) ? prev : [...prev, currentCard.id]);
      setRepeatCountByCard(prev => ({
        ...prev,
        [currentCard.id]: currentRepeats + 1,
      }));
    }
    setShowBack(initialShowBack);
    setDetailTab('example');
    setPronunciationFeedback(null);
  };

  const saveProgress = async () => {
    if (!selectedSet || savingProgress || unsavedCount === 0) return;

    const reviewCount = unsavedCount;
    setSavingProgress(true);
    setError(null);

    try {
      await saveFlashcardSession(
        selectedSet.id,
        Object.entries(sessionTags).map(([cardId, status]) => ({
          card_id: cardId,
          status,
        })),
      );
      setSessionTags({});
      setLastSavedCount(reviewCount);
      const studySession = await getFlashcardStudySession(selectedSet.id, studyMode);
      setStudySummary(studySession.summary);
    } catch {
      setLastSavedCount(0);
      setError('Progress could not be saved.');
    } finally {
      setSavingProgress(false);
    }
  };

  useEffect(() => {
    if (!selectedSet || activeQueueCount > 0 || unsavedCount === 0 || savingProgress) return;
    saveProgress();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSet, activeQueueCount, unsavedCount, savingProgress]);

  const startDiscussion = () => {
    if (!selectedSet) return;

    const vocabulary = selectedSet.cards
      .slice(0, 20)
      .map(card => card.front)
      .join(', ');
    const topic: SelectedConversation = {
      topicId: selectedSet.id,
      title: selectedSet.title,
      category: selectedSet.topic,
      description: selectedSet.description || `Vocabulary for ${selectedSet.topic}`,
      starterId: 'flashcards',
      starterTitle: 'Flashcard discussion',
      starterPrompt: `Let's talk about ${selectedSet.title}. Please help me actively use this vocabulary: ${vocabulary}`,
      isFreeTopic: true,
    };

    navigate('/chat', { state: { topic } });
  };

  const renderDetails = (card: Flashcard) => {
    if (detailTab === 'example') {
      return (
        <p className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm leading-relaxed text-slate-200">
          {card.example ?? 'No example available.'}
        </p>
      );
    }

    const details = detailTab === 'cases' ? card.case_examples : card.tense_examples;
    const entries = Object.entries(details ?? {});

    if (entries.length === 0) {
      return (
        <p className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-slate-500">
          No entries available.
        </p>
      );
    }

    return (
      <div className="space-y-2">
        {entries.map(([label, sentence]) => (
          <div key={label} className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-300">
              {label}
            </div>
            <div className="text-sm leading-relaxed text-slate-100">{sentence}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return <div className="text-slate-300">Loading flashcards...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Flashcards</h1>
        <p className="text-slate-400 text-sm">
          Learn vocabulary by topic, with examples for cases and tenses.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {audioError && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/30 px-4 py-3 text-sm text-red-200">
          {audioError}
        </div>
      )}

      {!selectedSet ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-xl bg-blue-600/20 p-2 text-blue-200">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Generate a new set</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Create a JSON flashcard set by topic. It will be saved in the content folder.
                </p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_120px_auto]">
              <input
                value={generateTopic}
                onChange={event => setGenerateTopic(event.target.value)}
                placeholder="Topic, e.g. work"
                className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-blue-500"
              />
              <input
                value={generatePreciseTopic}
                onChange={event => setGeneratePreciseTopic(event.target.value)}
                placeholder="Precise focus, e.g. job interview"
                className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-blue-500"
              />
              <input
                type="number"
                min={3}
                max={30}
                value={generateCount}
                onChange={event => setGenerateCount(Number(event.target.value))}
                className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleGenerateSet}
                disabled={generatingSet || !generateTopic.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles size={16} />
                {generatingSet ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {sets.map(set => (
              <button
                key={set.id}
                type="button"
                onClick={() => openSet(set.id)}
                disabled={loadingSet}
                className="rounded-2xl border border-slate-700 bg-slate-800 p-5 text-left transition-colors hover:border-blue-500/60 hover:bg-slate-700 disabled:opacity-60"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-blue-300">
                      <BookMarked size={14} />
                      {set.topic} · {set.level}
                    </div>
                    <h2 className="text-lg font-semibold text-white">{set.title}</h2>
                  </div>
                  <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200">
                    {set.card_count} cards
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-400">{set.description}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedSet(null)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
            >
              <ArrowLeft size={16} />
              Sets
            </button>
            <div className="text-right">
              <div className="text-sm font-semibold text-white">{selectedSet.title}</div>
              <div className="text-xs text-slate-400">
                {studyModeLabels[studyMode]} · {activeQueueCount} left · {progressLabel} done
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3">
            <div className="text-sm text-slate-300">
              Practice the cards first, or start a conversation with this vocabulary.
            </div>
            <button
              type="button"
              onClick={startDiscussion}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              <MessageSquare size={16} />
              Start conversation
            </button>
          </div>

          <div className="grid gap-2 rounded-2xl border border-slate-700 bg-slate-800 p-2 sm:grid-cols-3">
            {(Object.keys(studyModeLabels) as FlashcardStudyMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={async () => {
                  setStudyMode(mode);
                  await loadStudyQueue(selectedSet.id, mode);
                  setSessionTags({});
                  setLastSavedCount(0);
                  setShowBack(initialShowBack);
                  setDetailTab('example');
                }}
                className={clsx(
                  'rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                  studyMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                )}
              >
                {studyModeLabels[mode]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3">
            <div className="text-sm text-slate-300">
              {savingProgress
                ? 'Saving session...'
                : lastSavedCount > 0 && unsavedCount === 0
                  ? 'Session saved.'
                  : unsavedCount > 0
                    ? 'Session not saved.'
                    : 'No ratings in this session yet.'}
            </div>
            <button
              type="button"
              onClick={saveProgress}
              disabled={savingProgress || unsavedCount === 0}
              className={clsx(
                'rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
                unsavedCount > 0
                  ? 'bg-green-600 text-white hover:bg-green-500 disabled:opacity-60'
                  : 'bg-slate-700 text-slate-400',
              )}
            >
              {savingProgress
                ? 'Saving...'
                : unsavedCount > 0
                  ? 'Save progress'
                  : lastSavedCount > 0
                    ? 'Saved'
                    : 'No changes'}
            </button>
          </div>

          {currentCard ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {currentCard.tags?.map(tag => (
                    <span key={tag} className="rounded-full bg-blue-900/40 px-2.5 py-1 text-xs text-blue-200">
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-300">
                  {activeQueueCount} left
                </span>
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-300">Start side</div>
                <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
                  {(Object.keys(cardStartSideLabels) as CardStartSide[]).map(side => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => {
                        setCardStartSide(side);
                        setShowBack(side === 'back');
                      }}
                      className={clsx(
                        'rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                        cardStartSide === side
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-700 hover:text-white',
                      )}
                    >
                      {cardStartSideLabels[side]}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowBack(prev => !prev)}
                className="flex min-h-72 w-full flex-col items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-6 py-10 text-center transition-colors hover:border-blue-500/50"
              >
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {showBack ? 'Back' : 'Front'}
                </div>
                <div className="text-4xl font-bold text-white">{showBack ? currentCard.back : currentCard.front}</div>
                <div className="mt-5 text-sm text-slate-500">Click to flip</div>
              </button>

              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => moveCard(-1)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                >
                  <ArrowLeft size={16} />
                  Previous card
                </button>
                <button
                  type="button"
                  onClick={() => moveCard(1)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                >
                  Skip card
                  <ArrowRight size={16} />
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => speakText(visibleCardText, visibleCardAudioStyle)}
                  disabled={speakingText !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-50"
                >
                  {speakingText === visibleCardText
                    ? <Loader2 size={16} className="animate-spin" />
                    : <Volume2 size={16} />}
                  {showBack ? 'Listen to back' : 'Listen to front'}
                </button>
                <button
                  type="button"
                  onClick={togglePronunciationRecording}
                  disabled={pronunciationLoading}
                  className={clsx(
                    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50',
                    pronunciationRecording
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'bg-cyan-600 text-white hover:bg-cyan-500',
                  )}
                >
                  {pronunciationLoading
                    ? <Loader2 size={16} className="animate-spin" />
                    : pronunciationRecording
                      ? <MicOff size={16} />
                      : <Mic size={16} />}
                  {pronunciationRecording
                    ? 'Stop recording'
                    : pronunciationLoading
                      ? 'Checking...'
                      : 'Practice pronunciation'}
                </button>
              </div>

              {(pronunciationRecording || pronunciationFeedback) && (
                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                  {pronunciationRecording ? (
                    <div className="text-sm text-red-300">Recording... say the German word.</div>
                  ) : pronunciationFeedback && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">Pronunciation feedback</div>
                        <span className={clsx(
                          'rounded-full px-2.5 py-1 text-xs font-bold',
                          pronunciationFeedback.score >= 80
                            ? 'bg-green-500/20 text-green-300'
                            : pronunciationFeedback.score >= 55
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-red-500/20 text-red-300',
                        )}>
                          {pronunciationFeedback.score}/100
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Detected: <span className="text-slate-200">{pronunciationFeedback.transcribed_text || 'nothing'}</span>
                      </div>
                      <p className="text-sm text-slate-300">{pronunciationFeedback.feedback}</p>
                      <p className="text-xs text-cyan-200">{pronunciationFeedback.practice_tip}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                {reviewOptions.map(option => (
                  <button
                    key={option.rating}
                    type="button"
                    onClick={() => handleReview(option.rating)}
                    className={clsx(
                      'min-h-16 rounded-xl border bg-slate-900 px-3 py-2 text-center transition-colors',
                      sessionTags[currentCard.id] === option.rating && 'ring-2 ring-white/60',
                      option.className,
                    )}
                  >
                    <div className="text-sm font-semibold">{option.label}</div>
                    <div className="mt-1 text-[11px] leading-tight text-slate-400">{option.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                <Layers size={16} />
                Usage
              </div>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {(Object.keys(detailLabels) as DetailTab[]).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDetailTab(tab)}
                    className={clsx(
                      'rounded-lg px-2 py-2 text-xs font-semibold transition-colors',
                      detailTab === tab
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white',
                      !hasDetails(currentCard, tab) && detailTab !== tab && 'opacity-60'
                    )}
                  >
                    {detailLabels[tab]}
                  </button>
                ))}
              </div>
              {renderDetails(currentCard)}
              <div className="mt-4 flex flex-wrap gap-2">
                {currentCard.example && (
                  <button
                    type="button"
                    onClick={() => speakText(currentCard.example, 'natural German example sentence')}
                    disabled={speakingText !== null}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-50"
                  >
                    {speakingText === currentCard.example
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Volume2 size={14} />}
                    Listen to example
                  </button>
                )}
              </div>
            </div>
          </div>
          ) : (
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
              <div className="text-sm font-semibold text-white">
                {selectedSet.cards.length === 0
                  ? 'This set contains no cards.'
                  : initialQueueCount === 0
                    ? 'No cards for this view.'
                    : 'Session complete.'}
              </div>
              <div className="mt-1 text-sm text-slate-400">
                {selectedSet.cards.length === 0
                  ? ''
                  : initialQueueCount === 0
                    ? 'Choose another view if you still want to study.'
                    : savingProgress
                      ? 'Your progress is being saved automatically.'
                      : lastSavedCount > 0 && unsavedCount === 0
                        ? 'Your progress was saved automatically.'
                        : 'Your progress will be saved automatically.'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
