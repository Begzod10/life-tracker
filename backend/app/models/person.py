from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Person(Base):
    __tablename__ = "person"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, nullable=False, index=True)
    timezone = Column(String(50), default="Asia/Tashkent")

    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    last_logout_at = Column(DateTime, nullable=True)
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)

    auth_provider = Column(String(20), default="google")
    google_id = Column(String(255), unique=True, nullable=True, index=True)
    profile_photo_url = Column(String(500), nullable=True)
    telegram_chat_id = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── Relationships (string refs resolved lazily by mapper) ──────────────
    jobs = relationship("Job", back_populates="person", cascade="all, delete-orphan")
    expenses = relationship("Expense", back_populates="person", cascade="all, delete-orphan")
    income_sources = relationship("IncomeSource", back_populates="person", cascade="all, delete-orphan")
    savings = relationship("Saving", back_populates="person", cascade="all, delete-orphan")
    budgets = relationship("Budget", back_populates="person", cascade="all, delete-orphan")
    goals = relationship("Goal", back_populates="person", cascade="all, delete-orphan")
    time_blocks = relationship("TimeBlock", back_populates="person", cascade="all, delete-orphan")
    salary_months = relationship("SalaryMonth", back_populates="person", cascade="all, delete-orphan")
    dictionary_words = relationship("DictionaryWord", back_populates="person", cascade="all, delete-orphan")
    dictionary_folders = relationship("DictionaryFolder", back_populates="person", cascade="all, delete-orphan")
    dictionary_modules = relationship("DictionaryModule", back_populates="person", cascade="all, delete-orphan")
    practice_sessions = relationship("PracticeSession", back_populates="person", cascade="all, delete-orphan")
    essays = relationship("Essay", back_populates="person", cascade="all, delete-orphan")
    essay_attempts = relationship("EssayAttempt", back_populates="person", cascade="all, delete-orphan")
    essay_errors = relationship("EssayError", back_populates="person", cascade="all, delete-orphan")
    essay_plans = relationship("EssayPlan", back_populates="person", cascade="all, delete-orphan")
    books = relationship("Book", back_populates="person", cascade="all, delete-orphan")
    reading_sessions = relationship("ReadingSession", back_populates="person", cascade="all, delete-orphan")
    book_highlights = relationship("BookHighlight", back_populates="person", cascade="all, delete-orphan")
    exercise_attempts = relationship("ExerciseAttempt", back_populates="person", cascade="all, delete-orphan")
    news_category_picks = relationship("UserNewsCategory", back_populates="person", cascade="all, delete-orphan")
    grammar_points = relationship("UserGrammarPoint", back_populates="person", cascade="all, delete-orphan")
    essay_sessions = relationship("EssaySession", back_populates="person", cascade="all, delete-orphan")
    task2_attempts = relationship("Task2Attempt", back_populates="person", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Person(id={self.id}, email={self.email}, name={self.name})>"

    @property
    def is_locked(self) -> bool:
        if self.locked_until is None:
            return False
        return datetime.utcnow() < self.locked_until
