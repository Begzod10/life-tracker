from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class DictionaryFolder(Base):
    __tablename__ = "dictionary_folders"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)
    name = Column(String(120), nullable=False)
    color = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person", back_populates="dictionary_folders")
    modules = relationship("DictionaryModule", back_populates="folder", cascade="all, delete-orphan")


class DictionaryModule(Base):
    __tablename__ = "dictionary_modules"

    id = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("dictionary_folders.id", ondelete="CASCADE"), nullable=False)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person", back_populates="dictionary_modules")
    folder = relationship("DictionaryFolder", back_populates="modules")
    words = relationship("DictionaryWord", back_populates="module", cascade="all, delete-orphan")


class DictionaryWord(Base):
    __tablename__ = "dictionary_words"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)
    module_id = Column(Integer, ForeignKey("dictionary_modules.id", ondelete="CASCADE"), nullable=True, index=True)
    word = Column(String(200), nullable=False, index=True)
    definition = Column(Text, nullable=False)
    translation = Column(Text, nullable=True)
    part_of_speech = Column(String(50), nullable=True)
    examples = Column(Text, nullable=True)
    phonetic = Column(String(200), nullable=True)
    difficulty = Column(String(10), default="B1")
    tags = Column(String(500), nullable=True)
    review_count = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    last_reviewed_at = Column(DateTime, nullable=True)
    next_review_at = Column(DateTime, nullable=True, index=True)
    interval_days = Column(Integer, nullable=False, default=0)
    ease_factor = Column(Float, nullable=False, default=2.5, server_default="2.5")
    reps = Column(Integer, nullable=False, default=0, server_default="0")
    lapses = Column(Integer, nullable=False, default=0, server_default="0")
    source_book_id = Column(
        Integer,
        ForeignKey("books.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_page = Column(Integer, nullable=True)
    source_sentence = Column(Text, nullable=True)
    lexical_type = Column(String(20), nullable=False, default="word", server_default="word")
    word_meta = Column(JSON, nullable=True)
    deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person", back_populates="dictionary_words")
    module = relationship("DictionaryModule", back_populates="words")
    source_book = relationship("Book", foreign_keys=[source_book_id])


class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)
    mode = Column(String(20), nullable=False)
    total_questions = Column(Integer, default=0)
    correct_answers = Column(Integer, default=0)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    progress = Column(JSON, nullable=True)
    items_plan = Column(JSON, nullable=True)

    person = relationship("Person", back_populates="practice_sessions")


class ExerciseAttempt(Base):
    __tablename__ = "exercise_attempts"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False, index=True)
    session_id = Column(
        Integer,
        ForeignKey("practice_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    word_id = Column(
        Integer,
        ForeignKey("dictionary_words.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sentence = Column(Text, nullable=True)
    exercise_type = Column(String(50), nullable=False, server_default="sentence")
    response = Column(Text, nullable=False, server_default="")
    question_payload = Column(JSON, nullable=True)
    grammar_errors = Column(JSON, nullable=True)
    is_correct = Column(Boolean, nullable=False, default=False)
    usage_score = Column(Integer, nullable=True)
    feedback = Column(Text, nullable=True)
    suggested_revision = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    person = relationship("Person", back_populates="exercise_attempts")
    word = relationship("DictionaryWord")


class UserGrammarPoint(Base):
    __tablename__ = "user_grammar_points"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id", ondelete="CASCADE"), nullable=False)
    grammar_point_id = Column(String(64), nullable=False)

    reps = Column(Integer, default=0, nullable=False)
    ease = Column(Float, default=2.5, nullable=False)
    interval_days = Column(Float, default=0.0, nullable=False)
    lapses = Column(Integer, default=0, nullable=False)
    correct_count = Column(Integer, default=0, nullable=False)
    review_count = Column(Integer, default=0, nullable=False)
    last_seen_at = Column(DateTime, nullable=True)
    next_review_at = Column(DateTime, nullable=True)

    person = relationship("Person", back_populates="grammar_points")

    __table_args__ = (
        UniqueConstraint("person_id", "grammar_point_id", name="uq_user_grammar_point"),
    )
