export interface User {
  id: string;
  username: string;
  level: 'B1' | 'B2' | 'C1';
  german_variant?: 'de-DE' | 'de-AT' | 'de-CH';
  created_at: string;
}

export interface ConversationStarter {
  id: string;
  title: string;
  prompt: string;
}

export interface Topic {
  id: string;
  category: string;
  title: string;
  description: string;
  conversation_starters: ConversationStarter[];
}

export interface RecentFreeTopic {
  title: string;
  category: string;
  description: string;
  last_used_at: string;
}

export interface SelectedConversation {
  topicId: string;
  title: string;
  category: string;
  description: string;
  starterId: string;
  starterTitle: string;
  starterPrompt: string;
  isFreeTopic?: boolean;
}

export interface ConversationSession {
  id: number;
  user_id: string;
  topic: string;
  topic_category: string;
  started_at: string;
  ended_at?: string;
  score?: number;
  fluency_score?: number;
  accuracy_score?: number;
  vocabulary_score?: number;
  estimated_level?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  message_count: number;
  error_count: number;
  summary?: string;
}

export interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  corrected_content?: string;
  has_errors?: boolean;
  timestamp?: string;
}

export interface ErrorDetail {
  category: string;
  subcategory?: string;
  severity: 'light' | 'medium' | 'severe';
  original: string;
  corrected: string;
  explanation: string;
}

export interface ChatResponse {
  session_id: number;
  reply: string;
  corrections: ErrorDetail[];
  corrected_user_message?: string;
  has_errors: boolean;
  session_score?: number;
}

export type DiscussionMode = 'controlled' | 'realtime';

export interface RealtimeCredentials {
  client_secret: string;
  model: string;
  voice: string;
  max_seconds: number;
}

export interface ReviewCorrection {
  id: number;
  category: string;
  subcategory?: string;
  severity: 'light' | 'medium' | 'severe';
  original: string;
  corrected: string;
  explanation: string;
}

export interface ReviewMistake {
  message_id: number;
  original: string;
  corrected: string;
  corrections: ReviewCorrection[];
}

export interface SessionReview {
  session_id: number;
  status: 'active' | 'preparing' | 'ready';
  topic: string;
  summary?: string;
  score?: number;
  estimated_level?: string;
  mistakes: ReviewMistake[];
  transcript: Message[];
}

export interface StyleRewriteItem {
  id?: number;
  message_id: number;
  original: string;
  rewritten: string;
  style_notes: string;
  rewrite_mode: StyleRewriteMode;
  created_at?: string;
  register?: string;
}

export type StyleRewriteMode =
  | 'minimal'
  | 'natural'
  | 'casual'
  | 'elevated'
  | 'swiss_german';

export interface StyleRewriteResponse {
  session_id: number;
  rewrite_mode: StyleRewriteMode;
  rewrites: StyleRewriteItem[];
}

export interface TeacherRuleExample {
  german: string;
  english: string;
  note: string;
}

export interface TeacherRule {
  id: number;
  user_id: string;
  question: string;
  category: string;
  title: string;
  short_answer: string;
  explanation: string;
  examples: TeacherRuleExample[];
  related_terms: string[];
  created_at: string;
}

export interface ErrorRecord {
  id: number;
  user_id: string;
  session_id: number;
  category: string;
  subcategory?: string;
  severity: 'light' | 'medium' | 'severe';
  original_text: string;
  corrected_text: string;
  explanation: string;
  context?: string;
  count: number;
  created_at: string;
}

export interface ErrorStats {
  category: string;
  count: number;
  percentage: number;
  subcategories: Record<string, number>;
}

export interface Exercise {
  id: number;
  user_id: string;
  error_category: string;
  exercise_type: 'fill_blank' | 'correction' | 'multiple_choice' | 'translation' | 'vocabulary_cloze';
  title: string;
  instructions: string;
  content: ExerciseContent;
  difficulty: string;
  completed: boolean;
  score?: number;
  correct_answers?: Record<string, string | string[]>;
  attempts: ExerciseAttempt[];
  created_at: string;
}

export interface ExerciseAttemptItemResult {
  item_id: string;
  user_answer: string;
  correct_answer: string;
  status: 'correct' | 'partial' | 'incorrect';
  is_correct: boolean;
  message: string;
}

export interface ExerciseAttempt {
  id?: number | null;
  attempt_number: number;
  submitted_answers: Record<string, string>;
  feedback: string[];
  item_results: ExerciseAttemptItemResult[];
  score: number;
  created_at?: string | null;
}

export interface ExerciseContent {
  id?: string;
  sentences?: Array<{
    id: number;
    text?: string;
    english?: string;
    hint?: string;
    focus?: string;
    error_type?: string;
  }>;
  questions?: Array<{
    id: number;
    question: string;
    options: string[];
    context?: string;
  }>;
  topic_id?: string;
  topic_label?: string;
  source_text?: string;
  word_bank?: string[];
  gaps?: Array<{
    id: number;
    answer?: string;
    hint?: string;
    lemma?: string;
  }>;
  word_bank_entries?: Array<{
    label: string;
    gap_id?: number | string | null;
  }>;
  items?: Array<{
    id: number;
    noun: string;
    translation?: string;
    plural?: string;
  }>;
  preparation_use?: boolean;
  standalone_use?: boolean;
}

export interface ExerciseResult {
  score: number;
  feedback: string[];
  correct_answers: Record<string, string | string[]>;
  item_results: ExerciseAttemptItemResult[];
  attempt_number?: number;
}

export interface FlashcardSetSummary {
  id: string;
  topic: string;
  level: string;
  title: string;
  description: string;
  card_count: number;
}

export interface FlashcardGenerateRequest {
  user_id: string;
  topic: string;
  precise_topic?: string;
  count: number;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  example?: string;
  case_examples?: Record<string, string>;
  tense_examples?: Record<string, string>;
  tags?: string[];
}

export interface FlashcardSet {
  id: string;
  topic: string;
  level: string;
  title: string;
  description: string;
  cards: Flashcard[];
}

export type FlashcardReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type FlashcardStudyMode = 'due' | 'due_new' | 'all';

export interface FlashcardReviewProgress {
  card_id: string;
  status: FlashcardReviewRating;
  session_id: number;
  reviewed_at?: string | null;
}

export interface FlashcardProgress {
  user_id: string;
  set_id: string;
  latest_session_id?: number | null;
  reviews: FlashcardReviewProgress[];
}

export interface FlashcardSessionReview {
  card_id: string;
  status: FlashcardReviewRating;
}

export interface FlashcardStudySummary {
  total: number;
  due: number;
  new: number;
  not_due: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export interface FlashcardStudyCard extends Flashcard {
  latest_status?: FlashcardReviewRating | null;
  due_at?: string | null;
  interval_days: number;
  review_count: number;
  is_due: boolean;
  is_new: boolean;
  priority: number;
}

export interface FlashcardStudySession {
  user_id: string;
  set_id: string;
  mode: FlashcardStudyMode;
  cards: FlashcardStudyCard[];
  summary: FlashcardStudySummary;
}

export type ResourceType = 'video' | 'text' | 'audio';

export interface LearningResource {
  id: string;
  type: ResourceType;
  topic: string;
  level: string;
  title: string;
  source: string;
  url: string;
  description: string;
  focus?: string[];
  vocabulary?: string[];
  excerpt?: string;
}

export interface ResourceQuestion {
  id: number;
  type: 'comprehension' | 'vocabulary' | 'opinion' | 'grammar' | string;
  question: string;
  hint: string;
  model_answer: string;
}

export interface ResourceQuestionsResponse {
  resource_id: string;
  questions: ResourceQuestion[];
}

export type TranslationTarget = 'auto' | 'German' | 'English' | 'French';

export interface TranslationResponse {
  source_language?: string | null;
  target_language?: string | null;
  translation: string;
  alternatives: string[];
  notes: string;
}

export interface TranscriptionResponse {
  text: string;
}

export interface PronunciationFeedbackResponse {
  expected_text: string;
  transcribed_text: string;
  score: number;
  feedback: string;
  practice_tip: string;
}

export interface TimelineEntry {
  session_id: number;
  topic: string;
  date: string;
  error_count: number;
  score?: number;
  message_count: number;
  learner_word_count: number;
}

export interface ExerciseTimelineEntry {
  attempt_id: number;
  exercise_id: number;
  date: string;
  category: string;
  exercise_type: Exercise['exercise_type'];
  title: string;
  score: number;
  attempt_number: number;
}

export interface ActivityTimelineEntry {
  date: string;
  conversations: number;
  exercises: number;
  flashcard_sets: number;
}

export const ERROR_CATEGORY_COLORS: Record<string, string> = {
  grammar: '#ef4444',
  vocabulary: '#f97316',
  word_order: '#eab308',
  case: '#22c55e',
  gender: '#06b6d4',
  verb_conjugation: '#8b5cf6',
  preposition: '#ec4899',
  tense: '#14b8a6',
  spelling: '#64748b',
  punctuation: '#94a3b8',
  style: '#a855f7',
  other: '#6b7280',
};

export const ERROR_CATEGORY_LABELS: Record<string, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  word_order: 'Word order',
  case: 'Case',
  gender: 'Gender',
  verb_conjugation: 'Verb conjugation',
  preposition: 'Prepositions',
  tense: 'Tenses',
  spelling: 'Spelling',
  punctuation: 'Punctuation',
  style: 'Style',
  other: 'Other',
};
