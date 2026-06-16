from sqlalchemy import (
    Boolean, Column, Integer, String, Float, DateTime,
    ForeignKey, Text, JSON, Enum as SAEnum, UniqueConstraint, Uuid
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class ErrorCategory(str, enum.Enum):
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


class ErrorSeverity(str, enum.Enum):
    LIGHT = "light"
    MEDIUM = "medium"
    SEVERE = "severe"


class DifficultyLevel(str, enum.Enum):
    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"
    C1 = "C1"
    C2 = "C2"


class User(Base):
    __tablename__ = "profiles"

    id = Column(Uuid(as_uuid=True), primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    level = Column(String, default="B2")
    german_variant = Column(String, default="de-DE")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    sessions = relationship("ConversationSession", back_populates="user", cascade="all, delete-orphan")
    errors = relationship("ErrorRecord", back_populates="user", cascade="all, delete-orphan")
    exercises = relationship("Exercise", back_populates="user", cascade="all, delete-orphan")
    style_rewrites = relationship("StyleRewrite", back_populates="user", cascade="all, delete-orphan")
    teacher_rules = relationship("TeacherRule", back_populates="user", cascade="all, delete-orphan")
    flashcard_sets = relationship("FlashcardSet", back_populates="user", cascade="all, delete-orphan")


class ConversationSession(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    topic = Column(String, nullable=False)
    topic_category = Column(String, nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    score = Column(Float, nullable=True)          # 0-100
    fluency_score = Column(Float, nullable=True)
    accuracy_score = Column(Float, nullable=True)
    vocabulary_score = Column(Float, nullable=True)
    estimated_level = Column(String, nullable=True)
    message_count = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    summary = Column(Text, nullable=True)

    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session",
                            cascade="all, delete-orphan")
    errors = relationship("ErrorRecord", back_populates="session",
                          cascade="all, delete-orphan")
    style_rewrites = relationship("StyleRewrite", back_populates="session",
                                  cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)          # "user" | "assistant"
    content = Column(Text, nullable=False)
    corrected_content = Column(Text, nullable=True)
    has_errors = Column(Boolean, default=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("ConversationSession", back_populates="messages")


class StyleRewrite(Base):
    __tablename__ = "style_rewrites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    rewrite_mode = Column(String, nullable=False, default="natural")
    original = Column(Text, nullable=False)
    rewritten = Column(Text, nullable=False)
    style_notes = Column(Text, nullable=False, default="")
    style_register = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="style_rewrites")
    session = relationship("ConversationSession", back_populates="style_rewrites")
    message = relationship("Message")


class ErrorRecord(Base):
    __tablename__ = "errors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    category = Column(String, nullable=False)
    subcategory = Column(String, nullable=True)    # e.g. "Dativ", "Plusquamperfekt"
    severity = Column(String, nullable=False, default=ErrorSeverity.MEDIUM.value)
    original_text = Column(Text, nullable=False)
    corrected_text = Column(Text, nullable=False)
    explanation = Column(Text, nullable=False)
    context = Column(Text, nullable=True)          # surrounding sentence
    count = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="errors")
    session = relationship("ConversationSession", back_populates="errors")


class NounLexicon(Base):
    __tablename__ = "noun_lexicon"
    __table_args__ = (
        UniqueConstraint("singular", "gender", name="uq_noun_lexicon_singular_gender"),
    )

    id = Column(Integer, primary_key=True, index=True)
    singular = Column(String, nullable=False, index=True)
    singular_normalized = Column(String, nullable=False, index=True)
    gender = Column(String, nullable=False)  # m|f|n
    article = Column(String, nullable=False)  # der|die|das
    plural = Column(String, nullable=True)
    source = Column(String, nullable=False, default="nouns_cleaned.csv")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TeacherRule(Base):
    __tablename__ = "teacher_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    category = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    short_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=False)
    examples = Column(JSON, nullable=False, default=list)
    related_terms = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="teacher_rules")


class Exercise(Base):
    __tablename__ = "exercises"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    error_category = Column(String, nullable=False)
    exercise_type = Column(String, nullable=False)  # "fill_blank"|"translation"|"correction"|"multiple_choice"
    title = Column(String, nullable=False)
    instructions = Column(Text, nullable=False)
    content = Column(JSON, nullable=False)          # flexible structure per type
    answer_key = Column(JSON, nullable=False)
    difficulty = Column(String, default="C1")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="exercises")
    attempts = relationship(
        "ExerciseAttempt",
        back_populates="exercise",
        cascade="all, delete-orphan",
        order_by="ExerciseAttempt.attempt_number",
    )


class ExerciseAttempt(Base):
    __tablename__ = "exercise_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_number = Column(Integer, nullable=False)
    submitted_answers = Column(JSON, nullable=False)
    item_results = Column(JSON, nullable=False, default=list)
    score = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    exercise = relationship("Exercise", back_populates="attempts")


class FlashcardSet(Base):
    __tablename__ = "flashcard_sets"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    topic = Column(String, nullable=False, index=True)
    level = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="flashcard_sets")
    cards = relationship(
        "FlashcardCard",
        back_populates="set",
        cascade="all, delete-orphan",
        order_by="FlashcardCard.position",
    )


class FlashcardCard(Base):
    __tablename__ = "flashcard_cards"
    __table_args__ = (
        UniqueConstraint("set_id", "card_id", name="uq_flashcard_card_set_card"),
    )

    id = Column(Integer, primary_key=True, index=True)
    set_id = Column(String, ForeignKey("flashcard_sets.id", ondelete="CASCADE"), nullable=False, index=True)
    card_id = Column(String, nullable=False, index=True)
    position = Column(Integer, nullable=False, default=0)
    front = Column(Text, nullable=False)
    back = Column(Text, nullable=False)
    example = Column(Text, nullable=True)
    case_examples = Column(JSON, nullable=False, default=dict)
    tense_examples = Column(JSON, nullable=False, default=dict)
    tags = Column(JSON, nullable=False, default=list)

    set = relationship("FlashcardSet", back_populates="cards")


class FlashcardReviewState(Base):
    __tablename__ = "flashcard_review_states"
    __table_args__ = (
        UniqueConstraint("user_id", "set_id", "card_id", name="uq_flashcard_review_state"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    set_id = Column(String, nullable=False, index=True)
    card_id = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="new")  # new|again|hard|good|easy
    due_at = Column(DateTime(timezone=True), nullable=True, index=True)
    interval_days = Column(Float, nullable=False, default=0)
    ease_factor = Column(Float, nullable=False, default=2.3)
    review_count = Column(Integer, nullable=False, default=0)
    lapse_count = Column(Integer, nullable=False, default=0)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")


class FlashcardReviewEvent(Base):
    __tablename__ = "flashcard_review_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    set_id = Column(String, nullable=False, index=True)
    card_id = Column(String, nullable=False, index=True)
    rating = Column(String, nullable=False)  # again|hard|good|easy
    reviewed_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    previous_due_at = Column(DateTime(timezone=True), nullable=True)
    next_due_at = Column(DateTime(timezone=True), nullable=True)
    previous_interval_days = Column(Float, nullable=False, default=0)
    next_interval_days = Column(Float, nullable=False, default=0)
    previous_ease_factor = Column(Float, nullable=False, default=2.3)
    next_ease_factor = Column(Float, nullable=False, default=2.3)

    user = relationship("User")
