import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookMarked, GitMerge, Layers, Loader2, MessageSquare, Mic, MicOff, Pencil, Plus, Sparkles, Trash2, Volume2 } from 'lucide-react';
import { clsx } from 'clsx';
import {
  deleteFlashcard,
  deleteFlashcardSet,
  extendFlashcardSet,
  generateFlashcardSet,
  getPronunciationFeedback,
  getFlashcardSet,
  getFlashcardSets,
  getFlashcardStudySession,
  mergeFlashcardSets,
  saveFlashcardSession,
  transcribeAudio,
  updateFlashcard,
} from '../../api';
import type {
  Flashcard,
  FlashcardReviewRating,
  FlashcardSet,
  FlashcardSetSummary,
  FlashcardStudyMode,
  FlashcardStudySummary,
  FlashcardTranslationLanguage,
  PronunciationFeedbackResponse,
  SelectedConversation,
  User,
} from '../../types';
import { createMediaRecorder, playSpeech, stopMediaStream } from '../../utils/audio';

type DetailTab = 'example' | 'cases' | 'tenses';
type CardStartSide = 'front' | 'back';
type GenerationMode = 'theme' | 'terms';
type ManagementMode = 'extend' | 'merge' | 'cards' | null;

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

const translationLanguageLabels: Record<FlashcardTranslationLanguage, string> = {
  en: 'English',
  fr: 'French',
};

export const parseFlashcardTerms = (value: string): string[] => Array.from(new Set(
  value
    .split(/[,;\n]+/)
    .map(term => term.trim())
    .filter(Boolean),
)).slice(0, 30);

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
  const [generationMode, setGenerationMode] = useState<GenerationMode>('theme');
  const [translationLanguage, setTranslationLanguage] = useState<FlashcardTranslationLanguage>('en');
  const [customSetName, setCustomSetName] = useState('');
  const [customTermsText, setCustomTermsText] = useState('');
  const [vocabularyRecording, setVocabularyRecording] = useState(false);
  const [vocabularyTranscribing, setVocabularyTranscribing] = useState(false);
  const [managementMode, setManagementMode] = useState<ManagementMode>(null);
  const [managingSet, setManagingSet] = useState(false);
  const [managementNotice, setManagementNotice] = useState<string | null>(null);
  const [extendTermsText, setExtendTermsText] = useState('');
  const [mergeSetId, setMergeSetId] = useState('');
  const [mergeTitle, setMergeTitle] = useState('');
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [pronunciationRecording, setPronunciationRecording] = useState(false);
  const [pronunciationLoading, setPronunciationLoading] = useState(false);
  const [pronunciationFeedback, setPronunciationFeedback] = useState<PronunciationFeedbackResponse | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const pronunciationRecorderRef = useRef<MediaRecorder | null>(null);
  const pronunciationStreamRef = useRef<MediaStream | null>(null);
  const pronunciationChunksRef = useRef<BlobPart[]>([]);
  const vocabularyRecorderRef = useRef<MediaRecorder | null>(null);
  const vocabularyStreamRef = useRef<MediaStream | null>(null);
  const vocabularyChunksRef = useRef<BlobPart[]>([]);

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
  const customTermCount = parseFlashcardTerms(customTermsText).length;
  const canGenerateSet = generationMode === 'theme'
    ? Boolean(generateTopic.trim())
    : customTermCount > 0;
  const mergeCandidates = selectedSet
    ? sets.filter(set => (
        set.id !== selectedSet.id
        && (set.translation_language ?? 'en') === (selectedSet.translation_language ?? 'en')
      ))
    : [];
  const initialShowBack = cardStartSide === 'back';
  const visibleCardText = currentCard
    ? showBack
      ? currentCard.back
      : currentCard.front
    : '';
  const visibleCardAudioStyle = showBack
    ? selectedSet?.translation_language === 'fr'
      ? 'clear natural French pronunciation'
      : 'clear natural English pronunciation'
    : 'slow clear German pronunciation';
  const cardStartSideLabels: Record<CardStartSide, string> = {
    front: 'German first',
    back: `${translationLanguageLabels[selectedSet?.translation_language ?? 'en']} first`,
  };

  useEffect(() => {
    return () => {
      stopMediaStream(pronunciationStreamRef.current);
      stopMediaStream(vocabularyStreamRef.current);
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
    setManagementNotice(null);
    try {
      const [nextSet, studySession] = await Promise.all([
        getFlashcardSet(setId),
        getFlashcardStudySession(setId, 'due_new'),
      ]);

      setSelectedSet(nextSet);
      setManagementMode(null);
      setEditingCard(null);
      setExtendTermsText('');
      setMergeSetId('');
      setMergeTitle('');
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
    const topic = generationMode === 'theme' ? generateTopic.trim() : customSetName.trim();
    const preciseTopic = generatePreciseTopic.trim();
    const suppliedTerms = parseFlashcardTerms(customTermsText);
    if (generatingSet || (generationMode === 'theme' ? !topic : suppliedTerms.length === 0)) return;

    setGeneratingSet(true);
    setError(null);
    try {
      const generated = await generateFlashcardSet({
        topic: topic || undefined,
        precise_topic: generationMode === 'theme' ? preciseTopic || undefined : undefined,
        count: generationMode === 'theme'
          ? Math.min(30, Math.max(3, generateCount || 12))
          : suppliedTerms.length,
        terms: generationMode === 'terms' ? suppliedTerms : undefined,
        translation_language: translationLanguage,
      });
      const nextSets = await getFlashcardSets();
      setSets(nextSets);
      setGenerateTopic('');
      setGeneratePreciseTopic('');
      setCustomSetName('');
      setCustomTermsText('');
      await openSet(generated.id);
    } catch {
      setError('Flashcard set could not be generated.');
    } finally {
      setGeneratingSet(false);
    }
  };

  const stopVocabularyRecording = () => {
    if (vocabularyRecorderRef.current?.state === 'recording') {
      vocabularyRecorderRef.current.requestData();
      vocabularyRecorderRef.current.stop();
    }
    setVocabularyRecording(false);
  };

  const startVocabularyRecording = async (target: 'create' | 'extend') => {
    if (vocabularyRecording || vocabularyTranscribing || generatingSet) return;

    setAudioError(null);
    try {
      const { recorder, stream, chunks } = await createMediaRecorder();
      vocabularyRecorderRef.current = recorder;
      vocabularyStreamRef.current = stream;
      vocabularyChunksRef.current = chunks;
      recorder.onstop = async () => {
        const audioBlob = new Blob(vocabularyChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        stopMediaStream(vocabularyStreamRef.current);
        vocabularyStreamRef.current = null;
        vocabularyRecorderRef.current = null;
        vocabularyChunksRef.current = [];
        setVocabularyRecording(false);
        if (audioBlob.size === 0) return;

        setVocabularyTranscribing(true);
        try {
          const result = await transcribeAudio(audioBlob, 'flashcards');
          const appendTranscription = (previous: string) => (
            previous.trim() ? `${previous.trim()}, ${result.text}` : result.text
          );
          if (target === 'extend') setExtendTermsText(appendTranscription);
          else setCustomTermsText(appendTranscription);
        } catch {
          setAudioError('The vocabulary list could not be transcribed.');
        } finally {
          setVocabularyTranscribing(false);
        }
      };
      recorder.start(250);
      setVocabularyRecording(true);
    } catch {
      setAudioError('Microphone could not be started.');
      stopMediaStream(vocabularyStreamRef.current);
      vocabularyStreamRef.current = null;
      vocabularyRecorderRef.current = null;
      setVocabularyRecording(false);
    }
  };

  const toggleVocabularyRecording = (target: 'create' | 'extend') => {
    if (vocabularyRecording) stopVocabularyRecording();
    else void startVocabularyRecording(target);
  };

  const handleExtendSet = async () => {
    if (!selectedSet || managingSet) return;
    const terms = parseFlashcardTerms(extendTermsText);
    if (terms.length === 0) return;
    setManagingSet(true);
    setError(null);
    setManagementNotice(null);
    try {
      const extended = await extendFlashcardSet(selectedSet.id, terms);
      setSets(await getFlashcardSets());
      await openSet(extended.id);
      const addedLabel = `${extended.added_count} ${extended.added_count === 1 ? 'word' : 'words'} added.`;
      const skippedLabel = extended.skipped_count > 0
        ? ` ${extended.skipped_count} ${extended.skipped_count === 1 ? 'word was' : 'words were'} already in the set and skipped.`
        : '';
      setManagementNotice(`${addedLabel}${skippedLabel}`);
    } catch {
      setError('The new words could not be added.');
    } finally {
      setManagingSet(false);
    }
  };

  const handleMergeSets = async () => {
    if (!selectedSet || !mergeSetId || managingSet) return;
    setManagingSet(true);
    setError(null);
    try {
      const merged = await mergeFlashcardSets(
        [selectedSet.id, mergeSetId],
        mergeTitle.trim() || undefined,
      );
      setSets(await getFlashcardSets());
      await openSet(merged.id);
    } catch {
      setError('The flashcard sets could not be merged.');
    } finally {
      setManagingSet(false);
    }
  };

  const handleDeleteSet = async () => {
    if (!selectedSet?.is_editable || managingSet) return;
    if (!window.confirm(`Delete “${selectedSet.title}” and its study progress?`)) return;
    setManagingSet(true);
    setError(null);
    try {
      await deleteFlashcardSet(selectedSet.id);
      setSelectedSet(null);
      setManagementMode(null);
      setSets(await getFlashcardSets());
    } catch {
      setError('The flashcard set could not be deleted.');
    } finally {
      setManagingSet(false);
    }
  };

  const handleSaveCard = async () => {
    if (!selectedSet?.is_editable || !editingCard || managingSet) return;
    if (!editingCard.front.trim() || !editingCard.back.trim()) return;
    setManagingSet(true);
    setError(null);
    try {
      const saved = await updateFlashcard(selectedSet.id, editingCard.id, {
        front: editingCard.front,
        back: editingCard.back,
        example: editingCard.example ?? '',
        case_examples: editingCard.case_examples ?? {},
        tense_examples: editingCard.tense_examples ?? {},
        tags: editingCard.tags ?? [],
      });
      setSelectedSet(current => current ? {
        ...current,
        cards: current.cards.map(card => card.id === saved.id ? saved : card),
      } : current);
      setEditingCard(null);
    } catch {
      setError('The flashcard could not be saved.');
    } finally {
      setManagingSet(false);
    }
  };

  const handleDeleteCard = async (card: Flashcard) => {
    if (!selectedSet?.is_editable || managingSet) return;
    if (!window.confirm(`Delete “${card.front}” from this set?`)) return;
    setManagingSet(true);
    setError(null);
    try {
      await deleteFlashcard(selectedSet.id, card.id);
      setSets(await getFlashcardSets());
      await openSet(selectedSet.id);
    } catch {
      setError('The flashcard could not be deleted.');
    } finally {
      setManagingSet(false);
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
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-white sm:text-3xl">Flashcards</h1>
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

      {managementNotice && (
        <div className="rounded-xl border border-green-700/50 bg-green-900/25 px-4 py-3 text-sm text-green-200">
          {managementNotice}
        </div>
      )}

      {!selectedSet ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 sm:rounded-2xl sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-xl bg-blue-600/20 p-2 text-blue-200">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Generate a new set</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Let AI choose vocabulary for a theme, or provide your own German terms.
                </p>
              </div>
            </div>
            <div className="mb-4 grid gap-2 rounded-xl bg-slate-900 p-1 sm:grid-cols-2">
              {([
                ['theme', 'Generate from a theme'],
                ['terms', 'Use my own words'],
              ] as Array<[GenerationMode, string]>).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGenerationMode(mode)}
                  className={clsx(
                    'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                    generationMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {generationMode === 'theme' ? (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_120px]">
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
                  aria-label="Number of cards"
                  onChange={event => setGenerateCount(Number(event.target.value))}
                  className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-blue-500"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  value={customSetName}
                  onChange={event => setCustomSetName(event.target.value)}
                  placeholder="Set name (optional)"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-blue-500"
                />
                <textarea
                  value={customTermsText}
                  onChange={event => setCustomTermsText(event.target.value)}
                  rows={4}
                  maxLength={3800}
                  placeholder="German words or expressions, separated by commas or new lines"
                  className="w-full resize-y rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-blue-500"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggleVocabularyRecording('create')}
                    disabled={vocabularyTranscribing || generatingSet}
                    className={clsx(
                      'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50',
                      vocabularyRecording ? 'bg-red-600 hover:bg-red-500' : 'bg-cyan-600 hover:bg-cyan-500',
                    )}
                  >
                    {vocabularyTranscribing
                      ? <Loader2 size={16} className="animate-spin" />
                      : vocabularyRecording
                        ? <MicOff size={16} />
                        : <Mic size={16} />}
                    {vocabularyRecording
                      ? 'Stop dictating'
                      : vocabularyTranscribing
                        ? 'Transcribing...'
                        : 'Dictate words'}
                  </button>
                  <span className="text-xs text-slate-400">
                    {customTermCount}/30 terms detected — review the transcription before generating.
                  </span>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <label className="grid gap-1 text-xs font-semibold text-slate-300">
                Translation on the back
                <select
                  value={translationLanguage}
                  onChange={event => setTranslationLanguage(event.target.value as FlashcardTranslationLanguage)}
                  className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-normal text-white outline-none focus:border-blue-500"
                >
                  <option value="en">English</option>
                  <option value="fr">French</option>
                </select>
              </label>
              <button
                type="button"
                onClick={handleGenerateSet}
                disabled={generatingSet || vocabularyTranscribing || !canGenerateSet}
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
                className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-left transition-colors hover:border-blue-500/60 hover:bg-slate-700 disabled:opacity-60 sm:rounded-2xl sm:p-5"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-blue-300">
                      <BookMarked size={14} />
                      {set.topic} · {set.level} · {translationLanguageLabels[set.translation_language ?? 'en']}
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
        <div className="space-y-3 sm:space-y-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedSet(null)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
            >
              <ArrowLeft size={16} />
              Sets
            </button>
            <div className="min-w-0 text-right">
              <div className="truncate text-sm font-semibold text-white">{selectedSet.title}</div>
              <div className="text-xs text-slate-400">
                {studyModeLabels[studyMode]} · {activeQueueCount} left · {progressLabel} done
              </div>
            </div>
          </div>

          <div className="order-1 rounded-xl border border-slate-700 bg-slate-800 p-3 sm:order-none sm:rounded-2xl sm:p-4">
            <div className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => setManagementMode(current => current === 'extend' ? null : 'extend')}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:border-blue-500 hover:text-white"
              >
                <Plus size={15} /> Add words
              </button>
              {selectedSet.is_editable && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCard(null);
                      setManagementMode(current => current === 'cards' ? null : 'cards');
                    }}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:border-blue-500 hover:text-white"
                  >
                    <Pencil size={15} /> Edit cards
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setManagementMode(current => current === 'merge' ? null : 'merge')}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:border-blue-500 hover:text-white"
              >
                <GitMerge size={15} /> Merge with another set
              </button>
              {selectedSet.is_editable && (
                <button
                  type="button"
                  onClick={() => void handleDeleteSet()}
                  disabled={managingSet}
                  className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl border border-red-700/70 px-3 py-2 text-sm text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                >
                  <Trash2 size={15} /> Delete set
                </button>
              )}
            </div>

            {!selectedSet.is_editable && (
              <p className="mt-3 text-xs text-slate-400">
                This is a shared set. Adding words or merging creates a personal set; the original remains unchanged.
              </p>
            )}

            {managementMode === 'extend' && (
              <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
                <textarea
                  value={extendTermsText}
                  onChange={event => setExtendTermsText(event.target.value)}
                  rows={3}
                  placeholder="New German words or expressions, separated by commas or new lines"
                  className="w-full resize-y rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleVocabularyRecording('extend')}
                      disabled={vocabularyTranscribing || managingSet}
                      className={clsx(
                        'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:opacity-50',
                        vocabularyRecording ? 'bg-red-600' : 'bg-cyan-600',
                      )}
                    >
                      {vocabularyTranscribing
                        ? <Loader2 size={15} className="animate-spin" />
                        : vocabularyRecording
                          ? <MicOff size={15} />
                          : <Mic size={15} />}
                      {vocabularyRecording ? 'Stop dictating' : vocabularyTranscribing ? 'Transcribing...' : 'Dictate words'}
                    </button>
                    <span className="text-xs text-slate-400">{parseFlashcardTerms(extendTermsText).length}/30 terms</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleExtendSet()}
                    disabled={managingSet || vocabularyTranscribing || parseFlashcardTerms(extendTermsText).length === 0}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    {managingSet ? 'Adding...' : 'Generate and add'}
                  </button>
                </div>
              </div>
            )}

            {managementMode === 'merge' && (
              <div className="mt-4 grid gap-3 border-t border-slate-700 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <select
                  value={mergeSetId}
                  onChange={event => setMergeSetId(event.target.value)}
                  className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value="">Choose a set with a {translationLanguageLabels[selectedSet.translation_language]} back</option>
                  {mergeCandidates.map(set => <option key={set.id} value={set.id}>{set.title} ({set.card_count})</option>)}
                </select>
                <input
                  value={mergeTitle}
                  onChange={event => setMergeTitle(event.target.value)}
                  placeholder="Name for merged set (optional)"
                  className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => void handleMergeSets()}
                  disabled={!mergeSetId || managingSet}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {managingSet ? 'Merging...' : 'Create merged set'}
                </button>
                {mergeCandidates.length === 0 && (
                  <p className="text-xs text-slate-400 md:col-span-3">No other set uses the same back language.</p>
                )}
              </div>
            )}

            {managementMode === 'cards' && selectedSet.is_editable && (
              <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
                {selectedSet.cards.map(card => (
                  <div key={card.id} className="rounded-xl border border-slate-700 bg-slate-900 p-3">
                    {editingCard?.id === card.id ? (
                      <div className="space-y-3">
                        <input
                          value={editingCard.front}
                          onChange={event => setEditingCard(current => current ? { ...current, front: event.target.value } : current)}
                          placeholder="German front"
                          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                        />
                        <input
                          value={editingCard.back}
                          onChange={event => setEditingCard(current => current ? { ...current, back: event.target.value } : current)}
                          placeholder={`${translationLanguageLabels[selectedSet.translation_language]} back`}
                          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                        />
                        <textarea
                          value={editingCard.example ?? ''}
                          onChange={event => setEditingCard(current => current ? { ...current, example: event.target.value } : current)}
                          rows={2}
                          placeholder="German example sentence"
                          className="w-full resize-y rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                        />
                        <input
                          value={(editingCard.tags ?? []).join(', ')}
                          onChange={event => setEditingCard(current => current ? {
                            ...current,
                            tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 8),
                          } : current)}
                          placeholder="Tags, separated by commas"
                          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                        />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditingCard(null)} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                          <button
                            type="button"
                            onClick={() => void handleSaveCard()}
                            disabled={managingSet || !editingCard.front.trim() || !editingCard.back.trim()}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {managingSet ? 'Saving...' : 'Save card'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">{card.front}</div>
                          <div className="truncate text-xs text-slate-400">{card.back}</div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => setEditingCard({ ...card })} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white" title="Edit card"><Pencil size={15} /></button>
                          <button type="button" onClick={() => void handleDeleteCard(card)} disabled={managingSet} className="rounded-lg p-2 text-red-300 hover:bg-red-900/30 disabled:opacity-50" title="Delete card"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="order-3 flex items-center justify-end gap-3 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 sm:order-none sm:justify-between sm:rounded-2xl sm:px-4 sm:py-3">
            <div className="hidden text-sm text-slate-300 sm:block">
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

          <div className="order-4 grid grid-cols-3 gap-1 rounded-xl border border-slate-700 bg-slate-800 p-1.5 sm:order-none sm:gap-2 sm:rounded-2xl sm:p-2">
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
                  'rounded-lg px-1.5 py-2 text-[11px] font-semibold transition-colors sm:rounded-xl sm:px-3 sm:text-sm',
                  studyMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                )}
              >
                {studyModeLabels[mode]}
              </button>
            ))}
          </div>

          <div className="order-5 flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 sm:order-none sm:rounded-2xl sm:px-4 sm:py-3">
            <div className="truncate text-xs text-slate-300 sm:text-sm">
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
          <div className="order-2 grid gap-3 sm:order-none sm:gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-3 sm:rounded-2xl sm:p-5">
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
                <div className="grid w-full grid-cols-2 gap-1.5 sm:w-auto sm:gap-2">
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
                className="flex min-h-48 w-full flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-6 text-center transition-colors hover:border-blue-500/50 sm:min-h-72 sm:rounded-2xl sm:px-6 sm:py-10"
              >
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {showBack ? 'Back' : 'Front'}
                </div>
                <div className="text-3xl font-bold text-white sm:text-4xl">{showBack ? currentCard.back : currentCard.front}</div>
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

              <div className="mt-4 grid grid-cols-2 gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => speakText(visibleCardText, visibleCardAudioStyle)}
                  disabled={speakingText !== null}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-600 px-2 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-50 sm:gap-2 sm:px-4 sm:text-sm"
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
                    'inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-colors disabled:opacity-50 sm:gap-2 sm:px-4 sm:text-sm',
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

              <div className="mt-4 grid grid-cols-4 gap-1 sm:gap-2">
                {reviewOptions.map(option => (
                  <button
                    key={option.rating}
                    type="button"
                    onClick={() => handleReview(option.rating)}
                    className={clsx(
                      'min-h-14 rounded-lg border bg-slate-900 px-1 py-2 text-center transition-colors sm:min-h-16 sm:rounded-xl sm:px-3',
                      sessionTags[currentCard.id] === option.rating && 'ring-2 ring-white/60',
                      option.className,
                    )}
                  >
                    <div className="text-xs font-semibold sm:text-sm">{option.label}</div>
                    <div className="mt-1 hidden text-[11px] leading-tight text-slate-400 sm:block">{option.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-3 sm:rounded-2xl sm:p-5">
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
            <div className="order-2 rounded-xl border border-slate-700 bg-slate-800 p-5 sm:order-none">
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
