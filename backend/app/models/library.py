from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    author = Column(String(200), nullable=True)
    file_path = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, nullable=True)
    total_pages = Column(Integer, nullable=False, default=0)
    current_page = Column(Integer, nullable=False, default=1)
    resume_text = Column(Text, nullable=True)
    resume_page = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="reading", index=True)
    cover_url = Column(String(500), nullable=True)
    isbn = Column(String(20), nullable=True)
    tags = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    last_opened_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person", back_populates="books")
    sessions = relationship("ReadingSession", back_populates="book", cascade="all, delete-orphan")
    highlights = relationship("BookHighlight", back_populates="book", cascade="all, delete-orphan")


class ReadingSession(Base):
    __tablename__ = "reading_sessions"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    ended_at = Column(DateTime, nullable=True)
    start_page = Column(Integer, nullable=False, default=1)
    end_page = Column(Integer, nullable=False, default=1)
    pages_read = Column(Integer, nullable=False, default=0)
    minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    book = relationship("Book", back_populates="sessions")
    person = relationship("Person", back_populates="reading_sessions")


class BookHighlight(Base):
    __tablename__ = "book_highlights"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False, index=True)
    page = Column(Integer, nullable=False, default=1)
    text = Column(Text, nullable=False)
    note = Column(Text, nullable=True)
    kind = Column(String(20), nullable=False, default="highlight")
    color = Column(String(20), nullable=True)
    dictionary_word_id = Column(
        Integer,
        ForeignKey("dictionary_words.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_sentence = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    book = relationship("Book", back_populates="highlights")
    person = relationship("Person", back_populates="book_highlights")
