import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import type {
  User, Topic, RecentFreeTopic, ConversationSession, ChatResponse,
  ErrorRecord, ErrorStats, Exercise, ExerciseResult,
  TimelineEntry, ExerciseTimelineEntry, ActivityTimelineEntry,
  Message, StyleRewriteMode, StyleRewriteResponse,
  Flashcard, FlashcardExtendResult, FlashcardSetSummary, FlashcardSet,
  FlashcardProgress, FlashcardSessionReview,
  FlashcardGenerateRequest, FlashcardStudyMode, FlashcardStudySession,
  LearningResource, ResourceQuestionsResponse,
  TranslationResponse, TranslationTarget,
  PronunciationFeedbackResponse, TeacherRule, TranscriptionResponse,
  RealtimeCredentials, SessionReview,
} from '../types';

// In local development, Vite proxies /api to the FastAPI server. Deployments can
// override this with the public backend URL at build time.
const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: apiBaseUrl,
});

const authApi = axios.create({
  baseURL: apiBaseUrl,
});

let authTokenProvider: (() => Promise<string | null>) | null = null;

export const setAuthTokenProvider = (provider: () => Promise<string | null>) => {
  authTokenProvider = provider;
};

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (!authTokenProvider) {
    return config;
  }

  const token = await authTokenProvider();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export interface AuthMeResponse {
  id: string;
  email?: string;
  profile?: User | null;
}

export interface AuthSessionResponse {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number | null;
  token_type: string;
  profile?: User | null;
}

export interface SignUpProfile {
  username: string;
  level: 'B1' | 'B2' | 'C1';
  german_variant: 'de-DE' | 'de-CH' | 'de-AT';
}

export interface UserProfileUpdate {
  level: 'B1' | 'B2' | 'C1';
  german_variant: 'de-DE' | 'de-CH' | 'de-AT';
}

export const signIn = (email: string, password: string): Promise<AuthSessionResponse> =>
  api.post('/auth/sign-in', { email, password }).then(r => r.data);

export const signUp = (
  email: string,
  password: string,
  profile: SignUpProfile,
): Promise<AuthSessionResponse> =>
  api.post('/auth/sign-up', { email, password, ...profile }).then(r => r.data);

export const refreshAuthSession = (refreshToken: string): Promise<AuthSessionResponse> =>
  authApi.post('/auth/refresh', { refresh_token: refreshToken }).then(r => r.data);

export const getAuthMe = (): Promise<AuthMeResponse> =>
  api.get('/auth/me').then(r => r.data);

export const createAuthProfile = (
  username?: string,
  level: 'B1' | 'B2' | 'C1' = 'B2',
  germanVariant: 'de-DE' | 'de-CH' | 'de-AT' = 'de-DE',
): Promise<User> =>
  api.post('/auth/profile', { username, level, german_variant: germanVariant }).then(r => r.data);

// ── Users ────────────────────────────────────────────────────────────────
export const createUser = (username: string): Promise<User> =>
  api.post('/users/', { username }).then(r => r.data);

export const getUser = (): Promise<User> =>
  api.get('/users/me').then(r => r.data);

export const updateUserLevel = (level: string): Promise<void> =>
  api.patch('/users/me/level', null, { params: { level } }).then(r => r.data);

export const updateUserProfile = (
  profile: UserProfileUpdate,
): Promise<User> =>
  api.patch('/users/me', profile).then(r => r.data);

export const deleteUserAccount = (): Promise<void> =>
  api.delete('/users/me').then(r => r.data);

// ── Sessions ─────────────────────────────────────────────────────────────
export const getTopics = (): Promise<Topic[]> =>
  api.get('/sessions/topics').then(r => r.data);

export const getFreeConversationTopics = (): Promise<RecentFreeTopic[]> =>
  api.get('/sessions/free-conversation-topics').then(r => r.data);

export const createSession = (
  topic: string, topicCategory: string
): Promise<ConversationSession> =>
  api.post('/sessions/', { topic, topic_category: topicCategory })
     .then(r => r.data);

export const getUserSessions = (): Promise<ConversationSession[]> =>
  api.get('/sessions/me').then(r => r.data);

export const getSessionMessages = (sessionId: number): Promise<Message[]> =>
  api.get(`/sessions/${sessionId}/messages`).then(r => r.data);

export const endSession = (
  sessionId: number,
  saveCategory?: string,
) =>
  api.post(`/chat/session/${sessionId}/end`, null, {
    params: {
      ...(saveCategory ? { save_category: saveCategory } : {}),
    },
  }).then(r => r.data);

export const deleteSession = (sessionId: number) =>
  api.delete(`/sessions/${sessionId}`).then(r => r.data);

export const rewriteSessionStyle = (
  sessionId: number,
  rewriteMode: StyleRewriteMode,
  swissDialect?: string,
): Promise<StyleRewriteResponse> =>
  api.post(
    `/sessions/${sessionId}/style-rewrite`,
    { rewrite_mode: rewriteMode, swiss_dialect: swissDialect },
  ).then(r => r.data);

export const getSavedStyleRewrites = (
  sessionId: number,
  rewriteMode: StyleRewriteMode,
  swissDialect?: string,
): Promise<StyleRewriteResponse> =>
  api.get(`/sessions/${sessionId}/style-rewrites`, {
    params: { rewrite_mode: rewriteMode, swiss_dialect: swissDialect },
  }).then(r => r.data);

// ── Ask the teacher ──────────────────────────────────────────────────────
export const askTeacher = (question: string): Promise<TeacherRule> =>
  api.post('/teacher/ask', {
    question,
  }).then(r => r.data);

export const getTeacherRules = (
  category?: string,
): Promise<TeacherRule[]> =>
  api.get('/teacher/rules/me', {
    params: category ? { category } : {},
  }).then(r => r.data);

// ── Chat ─────────────────────────────────────────────────────────────────
export const sendMessage = (
  sessionId: number | null,
  message: string,
  conversationHistory: Array<{ role: string; content: string }>,
  topic?: string,
  topicCategory?: string,
): Promise<ChatResponse> =>
  api.post('/chat/message', {
    session_id: sessionId,
    message,
    conversation_history: conversationHistory,
    topic,
    topic_category: topicCategory,
  }).then(r => r.data);

export const createOpeningMessage = (
  sessionId: number,
): Promise<{ session_id: number; reply: string }> =>
  api.post(`/chat/session/${sessionId}/opening`).then(r => r.data);

const authenticatedFetch = async (path: string, init: RequestInit = {}) => {
  const token = authTokenProvider ? await authTokenProvider() : null;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
};

export interface ChatStreamHandlers {
  onSession?: (data: { session_id: number; user_message_id: number }) => void;
  onDelta: (text: string) => void;
  onDone?: (data: { assistant_message_id: number }) => void;
  onError?: (message: string) => void;
}

export const streamMessage = async (
  sessionId: number,
  message: string,
  signal: AbortSignal,
  handlers: ChatStreamHandlers,
  resumeUserMessageId?: number,
) => {
  const response = await authenticatedFetch('/chat/message/stream', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      session_id: sessionId,
      resume_user_message_id: resumeUserMessageId,
      message,
      conversation_history: [],
    }),
  });
  if (!response.ok || !response.body) throw new Error(`Chat stream failed (${response.status})`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];
  let streamError: string | null = null;
  const dispatch = () => {
    if (!dataLines.length) return;
    const data = JSON.parse(dataLines.join('\n'));
    if (eventName === 'session') handlers.onSession?.(data);
    if (eventName === 'delta') handlers.onDelta(data.text ?? '');
    if (eventName === 'done') handlers.onDone?.(data);
    if (eventName === 'error') {
      streamError = data.message ?? 'Response interrupted.';
      handlers.onError?.(streamError);
    }
    eventName = 'message';
    dataLines = [];
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      else if (!line.trim()) dispatch();
    }
    if (done) {
      dispatch();
      break;
    }
  }
  if (streamError) throw new Error(streamError);
};

export const getRealtimeCredentials = (
  sessionId: number,
  voice: string,
): Promise<RealtimeCredentials> =>
  api.post(`/chat/session/${sessionId}/realtime-credentials`, { voice }).then(r => r.data);

export const persistRealtimeTranscript = (
  sessionId: number,
  sequence: number,
  role: 'user' | 'assistant',
  content: string,
): Promise<{ message_id: number; next_sequence: number; duplicate: boolean }> =>
  api.post(`/chat/session/${sessionId}/transcript`, { sequence, role, content }).then(r => r.data);

export const reportRealtimeUsage = (
  sessionId: number,
  usage: Record<string, number>,
): Promise<void> => api.post(`/chat/session/${sessionId}/realtime-usage`, usage).then(() => undefined);

export const getSessionReview = (sessionId: number): Promise<SessionReview> =>
  api.get(`/chat/session/${sessionId}/review`).then(r => r.data);

export const retrySessionReview = (sessionId: number): Promise<void> =>
  api.post(`/chat/session/${sessionId}/review/retry`).then(() => undefined);

// ── Audio ────────────────────────────────────────────────────────────────
export const transcribeAudio = (
  audio: Blob,
  purpose: 'conversation' | 'flashcards' = 'conversation',
): Promise<TranscriptionResponse> => {
  const formData = new FormData();
  formData.append('file', audio, 'recording.webm');
  formData.append('purpose', purpose);

  return api.post('/audio/transcribe', formData).then(r => r.data);
};

export const createSpeechAudioUrl = async (
  text: string,
  voice = 'cedar',
  style = 'clear standard German',
  model = 'gpt-4o-mini-tts',
  dialect?: string,
): Promise<string> => {
  const response = await api.post('/audio/speech', {
    text,
    voice,
    style,
    model,
    dialect,
  }, {
    responseType: 'blob',
  });

  return URL.createObjectURL(response.data);
};

export const createSpeechStream = (
  text: string,
  voice = 'cedar',
  style = 'clear standard German',
  model = 'gpt-4o-mini-tts',
  dialect?: string,
): Promise<Response> => authenticatedFetch('/audio/speech', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text, voice, style, model, dialect }),
});

export const getPronunciationFeedback = (
  expectedText: string,
  audio: Blob,
): Promise<PronunciationFeedbackResponse> => {
  const formData = new FormData();
  formData.append('expected_text', expectedText);
  formData.append('file', audio, 'pronunciation.webm');

  return api.post('/audio/pronunciation-feedback', formData).then(r => r.data);
};

// ── Errors ───────────────────────────────────────────────────────────────
export const getUserErrors = (category?: string): Promise<ErrorRecord[]> =>
  api.get('/errors/me', { params: { category } }).then(r => r.data);

export const getErrorStats = (): Promise<ErrorStats[]> =>
  api.get('/errors/me/stats').then(r => r.data);

export const getErrorTimeline = (): Promise<TimelineEntry[]> =>
  api.get('/errors/me/timeline').then(r => r.data);

export const getExerciseTimeline = (): Promise<ExerciseTimelineEntry[]> =>
  api.get('/errors/me/exercise-timeline').then(r => r.data);

export const getActivityTimeline = (): Promise<ActivityTimelineEntry[]> =>
  api.get('/errors/me/activity-timeline').then(r => r.data);

// ── Exercises ────────────────────────────────────────────────────────────
export const generateExercises = (
  focusCategories?: string[],
  count = 3,
  topic?: string,
): Promise<Exercise[]> =>
  api.post('/exercises/generate', {
    focus_categories: focusCategories,
    count,
    ...(topic?.trim() ? { topic: topic.trim() } : {}),
  }).then(r => r.data);

export const getUserExercises = (
  completed?: boolean,
): Promise<Exercise[]> =>
  api.get('/exercises/me', {
    params: completed !== undefined ? { completed } : {},
  }).then(r => r.data);

export const submitExercise = (
  exerciseId: number,
  answers: Record<string, string>,
): Promise<ExerciseResult> =>
  api.post(`/exercises/${exerciseId}/submit`, { answers }).then(r => r.data);

// ── Flashcards ───────────────────────────────────────────────────────────
export const getFlashcardSets = (): Promise<FlashcardSetSummary[]> =>
  api.get('/flashcards/sets').then(r => r.data);

export const getFlashcardSet = (
  setId: string,
): Promise<FlashcardSet> =>
  api.get(`/flashcards/sets/${setId}`).then(r => r.data);

export const getFlashcardProgress = (
  setId: string,
): Promise<FlashcardProgress> =>
  api.get(`/flashcards/progress/${setId}`).then(r => r.data);

export const getFlashcardStudySession = (
  setId: string,
  mode: FlashcardStudyMode = 'due_new',
): Promise<FlashcardStudySession> =>
  api.get(`/flashcards/study-session/${setId}`, {
    params: { mode },
  }).then(r => r.data);

export const generateFlashcardSet = (
  request: FlashcardGenerateRequest,
): Promise<FlashcardSetSummary> =>
  api.post('/flashcards/sets/generate', {
    topic: request.topic,
    precise_topic: request.precise_topic,
    count: request.count ?? 12,
    terms: request.terms ?? [],
    translation_language: request.translation_language,
  }).then(r => r.data);

export const extendFlashcardSet = (
  setId: string,
  terms: string[],
): Promise<FlashcardExtendResult> =>
  api.post(`/flashcards/sets/${setId}/extend`, { terms }).then(r => r.data);

export const mergeFlashcardSets = (
  setIds: [string, string],
  title?: string,
): Promise<FlashcardSet> =>
  api.post('/flashcards/sets/merge', { set_ids: setIds, title }).then(r => r.data);

export const deleteFlashcardSet = (setId: string): Promise<void> =>
  api.delete(`/flashcards/sets/${setId}`).then(() => undefined);

export const updateFlashcard = (
  setId: string,
  cardId: string,
  card: Omit<Flashcard, 'id'>,
): Promise<Flashcard> =>
  api.put(`/flashcards/sets/${setId}/cards/${cardId}`, card).then(r => r.data);

export const deleteFlashcard = (setId: string, cardId: string): Promise<void> =>
  api.delete(`/flashcards/sets/${setId}/cards/${cardId}`).then(() => undefined);

export const saveFlashcardSession = (
  setId: string,
  reviews: FlashcardSessionReview[],
): Promise<FlashcardProgress> =>
  api.post('/flashcards/progress/session', {
    set_id: setId,
    reviews,
  }).then(r => r.data);

// ── Resources ─────────────────────────────────────────────────────────────
export const getResources = (
  resourceType?: string,
  topic?: string,
): Promise<LearningResource[]> =>
  api.get('/resources', {
    params: {
      ...(resourceType ? { resource_type: resourceType } : {}),
      ...(topic ? { topic } : {}),
    },
  }).then(r => r.data);

export const generateResourceQuestions = (
  resourceId: string,
  level: string,
  questionCount = 5,
): Promise<ResourceQuestionsResponse> =>
  api.post(`/resources/${resourceId}/questions`, {
    level,
    question_count: questionCount,
  }).then(r => r.data);

// ── Translation ───────────────────────────────────────────────────────────
export const translateText = (
  text: string,
  targetLanguage: TranslationTarget = 'auto',
): Promise<TranslationResponse> =>
  api.post('/translate', {
    text,
    target_language: targetLanguage,
  }).then(r => r.data);
