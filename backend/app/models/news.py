from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class NewsCategory(Base):
    __tablename__ = "news_categories"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(50), unique=True, nullable=False, index=True)
    label = Column(String(100), nullable=False)
    color = Column(String(20), nullable=True)
    sort_order = Column(Integer, default=0)

    mode = Column(String(10), nullable=False, default="native")
    newsdata_category = Column(String(50), nullable=True)
    search_query = Column(String(500), nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("NewsItem", back_populates="category", cascade="all, delete-orphan")
    picks = relationship("UserNewsCategory", back_populates="category", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<NewsCategory(slug={self.slug}, mode={self.mode})>"


class NewsItem(Base):
    __tablename__ = "news_items"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(
        Integer,
        ForeignKey("news_categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date = Column(Date, nullable=False, index=True)

    headline = Column(String(500), nullable=False)
    summary = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    content = Column(Text, nullable=True)
    url = Column(String(2000), nullable=False, index=True)
    image_url = Column(String(2000), nullable=True)
    source_name = Column(String(200), nullable=True)
    provider = Column(String(20), nullable=False)
    published_at = Column(DateTime, nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)

    category = relationship("NewsCategory", back_populates="items")


class UserNewsCategory(Base):
    __tablename__ = "user_news_categories"

    person_id = Column(Integer, ForeignKey("person.id", ondelete="CASCADE"), primary_key=True)
    category_id = Column(Integer, ForeignKey("news_categories.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    person = relationship("Person", back_populates="news_category_picks")
    category = relationship("NewsCategory", back_populates="picks")
