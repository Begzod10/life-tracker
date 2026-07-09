from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class DailyLog(Base):
    __tablename__ = "daily_logs"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    mood = Column(Integer, nullable=True)
    energy = Column(Integer, nullable=True)
    journal = Column(Text, nullable=True)
    wins = Column(Text, nullable=True)
    challenges = Column(Text, nullable=True)
    improvements = Column(Text, nullable=True)
    intention_1 = Column(String(300), nullable=True)
    intention_2 = Column(String(300), nullable=True)
    intention_3 = Column(String(300), nullable=True)
    ai_reflection = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person", backref="daily_logs")
