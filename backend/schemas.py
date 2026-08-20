from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Any, Dict, Literal
from datetime import datetime
from enum import Enum
from uuid import UUID


# ── Enums ──────────────────────────────────────────────────────────────────
class ErrorCategory(str, Enum):
    GRAMMAR = "grammar"
    VOCABULARY = "vocabulary"
    WORD_ORDER = "word_order"
    CASE = "case"
    GENDER = "gender"
    VERB_CONJUGATION = "verb_conjugation"
    PREPOSITION = "preposition"
    TENSE = "tense"
    SPELLING = "spelling"
    PUNCTUATION = "punctuation"
    STYLE = "style"
    OTHER = "other"


class ErrorSeverity(str, Enum):
    LIGHT = "light"
    MEDIUM = "medium"
    SEVERE = "severe"


# ── User ───────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    level: str
    german_variant: str = "de-DE"
    created_at: datetime


class UserProfileUpdate(BaseModel):
    level: str
    german_variant: str


class AuthProfileCreate(BaseModel):
    username: Optional[str] = None
    level: str = "B2"
    german_variant: str = "de-DE"


class AuthMeResponse(BaseModel):
    id: UUID
    email: Optional[str] = None
    profile: Optional[UserResponse] = None


class AuthCredentials(BaseModel):
    email: str
    password: str
    username: Optional[str] = None
    level: str = "B2"
    german_variant: str = "de-DE"


class AuthSessionResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    expires_at: Optional[int] = None
    token_type: str = "bearer"
    profile: Optional[UserResponse] = None


class AuthRefreshRequest(BaseModel):
    refresh_token: str


# ── Session ────────────────────────────────────────────────────────────────
class SessionCreate(BaseModel):
    topic: str
    topic_category: str

class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: UUID
    topic: str
    topic_category: str
    started_at: datetime
    ended_at: Optional[datetime]
    score: Optional[float]
    fluency_score: Optional[float]
    accuracy_score: Optional[float]
    vocabulary_score: Optional[float]
    estimated_level: Optional[str]
    message_count: int
    error_count: int
    summary: Optional[str]


# ── Chat ───────────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    session_id: Optional[int] = None
    resume_user_message_id: Optional[int] = Field(default=None, ge=1)
    message: str
    topic: Optional[str] = None
    topic_category: Optional[str] = None
    conversation_history: List[ChatMessage] = []

class ChatOpeningResponse(BaseModel):
    session_id: int
    reply: str

class ErrorDetail(BaseModel):
    category: str
    subcategory: Optional[str] = None
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
    original: str
    corrected: str
    explanation: str

class ChatResponse(BaseModel):
    session_id: int
    reply: str
    corrections: List[ErrorDetail] = []
    corrected_user_message: Optional[str] = None
    has_errors: bool = False
    session_score: Optional[float] = None


class RealtimeTranscriptRequest(BaseModel):
    sequence: int = Field(ge=0)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class RealtimeCredentialsRequest(BaseModel):
    voice: Optional[str] = Field(default=None, min_length=1, max_length=40)


class RealtimeTranscriptResponse(BaseModel):
    message_id: int
    sequence: int
    next_sequence: int
    duplicate: bool = False


class RealtimeUsageRequest(BaseModel):
    input_audio_tokens: int = Field(default=0, ge=0)
    output_audio_tokens: int = Field(default=0, ge=0)
    input_text_tokens: int = Field(default=0, ge=0)
    output_text_tokens: int = Field(default=0, ge=0)


class ReviewCorrection(BaseModel):
    id: int
    category: str
    subcategory: Optional[str] = None
    severity: str
    original: str
    corrected: str
    explanation: str


class ReviewMistake(BaseModel):
    message_id: int
    original: str
    corrected: str
    corrections: List[ReviewCorrection]


class SessionReviewResponse(BaseModel):
    session_id: int
    status: Literal["active", "preparing", "ready"]
    topic: str
    summary: Optional[str] = None
    score: Optional[float] = None
    estimated_level: Optional[str] = None
    mistakes: List[ReviewMistake] = []
    transcript: List[Dict[str, Any]] = []


# ── Style rewrite ─────────────────────────────────────────────────────────
class StyleRewriteRequest(BaseModel):
    rewrite_mode: str = "natural"
    swiss_dialect: Optional[str] = None


class StyleRewriteItem(BaseModel):
    id: Optional[int] = None
    message_id: int
    original: str
    rewritten: str
    style_notes: str
    rewrite_mode: str = "natural"
    created_at: Optional[datetime] = None
    style_register: Optional[str] = Field(default=None, alias="register")


class StyleRewriteResponse(BaseModel):
    session_id: int
    rewrite_mode: str = "natural"
    rewrites: List[StyleRewriteItem] = []


# ── Error records ──────────────────────────────────────────────────────────
class ErrorRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: UUID
    session_id: int
    category: str
    subcategory: Optional[str]
    severity: str
    original_text: str
    corrected_text: str
    explanation: str
    context: Optional[str]
    count: int
    created_at: datetime

class ErrorStats(BaseModel):
    category: str
    count: int
    percentage: float
    subcategories: Dict[str, int] = {}


# ── Ask the teacher ───────────────────────────────────────────────────────
class TeacherQuestionRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1200)


class TeacherRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: UUID
    question: str
    category: str
    title: str
    short_answer: str
    explanation: str
    examples: List[Dict[str, str]] = []
    related_terms: List[str] = []
    created_at: datetime


class VocabularyClozeGap(BaseModel):
    id: int
    answer: str
    hint: Optional[str] = None
    lemma: Optional[str] = None


class VocabularyClozeContent(BaseModel):
    id: str
    topic_id: str
    topic_label: str
    source_text: str
    word_bank: List[str]
    gaps: List[VocabularyClozeGap]
    preparation_use: bool = True
    standalone_use: bool = True


# ── Exercise ───────────────────────────────────────────────────────────────
class ExerciseGenerateRequest(BaseModel):
    focus_categories: Optional[List[str]] = None   # None → auto from weak points
    topic: Optional[str] = Field(default=None, max_length=200)
    count: int = Field(default=3, ge=1, le=10)


class ExerciseAttemptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    attempt_number: int
    submitted_answers: Any
    feedback: List[str]
    item_results: List[Dict[str, Any]] = []
    score: float
    created_at: Optional[datetime] = None


class ExerciseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: UUID
    error_category: str
    exercise_type: str
    title: str
    instructions: str
    content: Any
    difficulty: str
    completed: bool
    score: Optional[float]
    correct_answers: Optional[Any] = None
    attempts: List[ExerciseAttemptResponse] = []
    created_at: datetime

class ExerciseSubmit(BaseModel):
    answers: Any                  # mirrors content structure

class ExerciseResult(BaseModel):
    score: float
    feedback: List[str]
    correct_answers: Any
    item_results: List[Dict[str, Any]] = []
    attempt_number: Optional[int] = None
