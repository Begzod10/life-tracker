from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Essay(Base):
    __tablename__ = "essays"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False, index=True)
    title = Column(String(200), nullable=True)
    prompt = Column(Text, nullable=False)
    body = Column(Text, nullable=False, default="")
    level = Column(String(10), nullable=False, default="B1")
    target_word_count = Column(Integer, nullable=True)
    target_words = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="draft")
    word_count = Column(Integer, nullable=False, default=0)
    quick_score = Column(Integer, nullable=True)
    quick_feedback = Column(Text, nullable=True)
    deep_score = Column(Integer, nullable=True)
    deep_review = Column(Text, nullable=True)
    time_spent_seconds = Column(Integer, nullable=False, default=0)
    deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)

    person = relationship("Person", back_populates="essays")
    attempts = relationship("EssayAttempt", back_populates="essay", cascade="all, delete-orphan")
    errors = relationship("EssayError", back_populates="essay", cascade="all, delete-orphan")
    plan = relationship("EssayPlan", back_populates="essay", cascade="all, delete-orphan", uselist=False)


class EssayAttempt(Base):
    __tablename__ = "essay_attempts"

    id = Column(Integer, primary_key=True, index=True)
    essay_id = Column(Integer, ForeignKey("essays.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False, index=True)
    kind = Column(String(20), nullable=False)
    score = Column(Integer, nullable=False)
    level_estimate = Column(String(10), nullable=True)
    word_count = Column(Integer, nullable=False, default=0)
    payload = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    essay = relationship("Essay", back_populates="attempts")
    person = relationship("Person", back_populates="essay_attempts")


class EssayError(Base):
    __tablename__ = "essay_errors"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("essay_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    essay_id = Column(Integer, ForeignKey("essays.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False, index=True)
    kind = Column(String(20), nullable=False, index=True)
    original = Column(Text, nullable=True)
    explanation = Column(Text, nullable=True)
    suggestion = Column(Text, nullable=True)
    level = Column(String(10), nullable=True)
    review_count = Column(Integer, nullable=False, default=0)
    correct_count = Column(Integer, nullable=False, default=0)
    interval_days = Column(Integer, nullable=False, default=0)
    last_reviewed_at = Column(DateTime, nullable=True)
    next_review_at = Column(DateTime, nullable=True, index=True)
    archived = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    essay = relationship("Essay", back_populates="errors")
    person = relationship("Person", back_populates="essay_errors")


class EssayPlan(Base):
    __tablename__ = "essay_plans"

    id = Column(Integer, primary_key=True, index=True)
    essay_id = Column(
        Integer,
        ForeignKey("essays.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False, index=True)
    thesis = Column(Text, nullable=True)
    body_plans = Column(Text, nullable=True)
    conclusion_plan = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    essay = relationship("Essay", back_populates="plan")
    person = relationship("Person", back_populates="essay_plans")


class EssaySession(Base):
    __tablename__ = "essay_sessions"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False, index=True)
    mode = Column(String(20), nullable=False, server_default="essay")
    essay_type = Column(String(30), nullable=False)
    target_band = Column(Float, nullable=False, server_default="7.0")
    question_payload = Column(JSON, nullable=False, default=dict)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    person = relationship("Person", back_populates="essay_sessions")
    attempt = relationship("Task2Attempt", back_populates="session", uselist=False)


class Task2Attempt(Base):
    __tablename__ = "task2_attempts"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False, index=True)
    session_id = Column(
        Integer,
        ForeignKey("essay_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    essay_type = Column(String(30), nullable=False)
    question = Column(Text, nullable=False)
    question_type = Column(String(30), nullable=False)
    assigned_position = Column(Text, nullable=True)
    target_band = Column(Float, nullable=False, server_default="7.0")

    response = Column(Text, nullable=False)
    word_count = Column(Integer, nullable=False, server_default="0")
    time_seconds = Column(Integer, nullable=True)

    criteria_scores = Column(JSON, nullable=True)
    overall_band = Column(Float, nullable=True)
    is_correct = Column(Boolean, nullable=False, default=False)

    essay_errors = Column(JSON, nullable=True)
    essay_focus_snapshot = Column(JSON, nullable=True)

    feedback = Column(Text, nullable=True)
    model_revision = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    person = relationship("Person", back_populates="task2_attempts")
    session = relationship("EssaySession", back_populates="attempt")


class ParaphraseAttempt(Base):
    __tablename__ = "paraphrase_attempts"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id", ondelete="CASCADE"), nullable=False, index=True)
    technique = Column(String(50), nullable=False)
    sentence_id = Column(Integer, nullable=True)
    original_sentence = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    applied_correctly = Column(Boolean, nullable=True)
    technique_check = Column(Text, nullable=True)
    feedback = Column(Text, nullable=True)
    model_answer = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    person = relationship("Person", backref="paraphrase_attempts")


class GapFillAttempt(Base):
    __tablename__ = "gap_fill_attempts"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id", ondelete="CASCADE"), nullable=False, index=True)
    word_id = Column(Integer, ForeignKey("dictionary_words.id", ondelete="SET NULL"), nullable=True)
    word = Column(String(200), nullable=False)
    gap_type = Column(String(30), nullable=False)
    sentence = Column(Text, nullable=False)
    word_form_answer = Column(String(100), nullable=True)
    word_form_distractor = Column(String(100), nullable=True)
    word_form_response = Column(String(100), nullable=True)
    word_form_correct = Column(Boolean, nullable=True)
    preposition_answer = Column(String(50), nullable=True)
    preposition_response = Column(String(50), nullable=True)
    preposition_correct = Column(Boolean, nullable=True)
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    person = relationship("Person", backref="gap_fill_attempts")


class MiniBuildAttempt(Base):
    __tablename__ = "mini_build_attempts"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id", ondelete="CASCADE"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    question_type = Column(String(50), nullable=True)
    required_words = Column(JSON, nullable=True)
    response = Column(Text, nullable=False)
    paraphrase_score = Column(Integer, nullable=True)
    vocab_score = Column(Integer, nullable=True)
    position_score = Column(Integer, nullable=True)
    total_score = Column(Integer, nullable=True)
    feedback = Column(Text, nullable=True)
    model_answer = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    person = relationship("Person", backref="mini_build_attempts")
