"""Read-only SQLAlchemy models bound to the external Gennis CRM database.

These models mirror only the tables we read — they do NOT own the schema and
no migrations target this base. The engine is opened in read-only transaction
mode so a bug here can never mutate Gennis.

Why a separate Base?
- The Gennis DB has its own conventions (lowercased table names like
  `teachersalary`, no FKs we want to inherit, etc.). Mixing them into the
  main `app.database.Base` would let Alembic try to manage them.
- Keeping them isolated also makes the read-only intent explicit.

Usage:
    from app.external_models.gennis import gennis_session, GennisUser

    with gennis_session() as gs:
        user = gs.query(GennisUser).filter_by(username="rimefara_teach").first()
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator, Optional

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

from app.config import settings


GennisBase = declarative_base()


# ─── Engine + session factory (lazy) ──────────────────────────────────────────
_engine: Optional[Engine] = None
_SessionFactory: Optional[sessionmaker] = None


def _build_engine() -> Optional[Engine]:
    if not settings.GENNIS_DB_URL:
        return None
    return create_engine(
        settings.GENNIS_DB_URL,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=2,
        # Force the connection into read-only mode so an accidental
        # commit cannot mutate the external system.
        connect_args={"options": "-c default_transaction_read_only=on"},
    )


def get_engine() -> Optional[Engine]:
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def _get_session_factory() -> Optional[sessionmaker]:
    global _SessionFactory
    if _SessionFactory is not None:
        return _SessionFactory
    eng = get_engine()
    if eng is None:
        return None
    _SessionFactory = sessionmaker(bind=eng, autocommit=False, autoflush=False)
    return _SessionFactory


@contextmanager
def gennis_session() -> Iterator[Session]:
    """Open a short-lived read-only session against Gennis."""
    factory = _get_session_factory()
    if factory is None:
        raise RuntimeError("GENNIS_DB_URL is not configured")
    session = factory()
    try:
        yield session
    finally:
        session.close()


def is_configured() -> bool:
    """Cheap check: can we open a Gennis session at all?"""
    return bool(settings.GENNIS_DB_URL)


# ─── Models (read-only) ───────────────────────────────────────────────────────
class GennisCalendarYear(GennisBase):
    __tablename__ = "calendaryear"
    id = Column(Integer, primary_key=True)
    date = Column(DateTime)


class GennisCalendarMonth(GennisBase):
    __tablename__ = "calendarmonth"
    id = Column(Integer, primary_key=True)
    date = Column(DateTime)
    year_id = Column(Integer, ForeignKey("calendaryear.id"))


class GennisCalendarDay(GennisBase):
    __tablename__ = "calendarday"
    id = Column(Integer, primary_key=True)
    date = Column(DateTime)
    month_id = Column(Integer, ForeignKey("calendarmonth.id"))


class GennisPaymentType(GennisBase):
    __tablename__ = "paymenttypes"
    id = Column(Integer, primary_key=True)
    name = Column(String(50))


class GennisUser(GennisBase):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    surname = Column(String)
    username = Column(String, index=True)
    role_id = Column(Integer)
    location_id = Column(Integer)
    telegram_id = Column(String)
    deleted = Column(Boolean)


class GennisTeacher(GennisBase):
    __tablename__ = "teachers"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    user = relationship("GennisUser", uselist=False, lazy="joined")


class GennisTeacherSalary(GennisBase):
    """Per-location monthly aggregate. This is what the user calls
    "TeacherSalaryLocation". One row per (teacher, location, calendar_month).
    """

    __tablename__ = "teachersalary"
    id = Column(Integer, primary_key=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), index=True)
    location_id = Column(Integer)
    calendar_month = Column(Integer, ForeignKey("calendarmonth.id"))
    calendar_year = Column(Integer, ForeignKey("calendaryear.id"))
    total_salary = Column(Float)
    taken_money = Column(Float)
    remaining_salary = Column(Float)
    status = Column(Boolean)
    debt = Column(Float)
    total_fine = Column(Float)

    month = relationship("GennisCalendarMonth", uselist=False, lazy="joined")


class GennisTeacherPayment(GennisBase):
    """Individual payment ledger. This is what the user calls
    "TeacherSalaries" — one row per avans / final / fine payment, linked back
    to a GennisTeacherSalary row via salary_location_id.
    """

    __tablename__ = "teachersalaries"
    id = Column(Integer, primary_key=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), index=True)
    salary_location_id = Column(Integer, ForeignKey("teachersalary.id"), index=True)
    location_id = Column(Integer)
    payment_sum = Column(Float)
    payment_type_id = Column(Integer, ForeignKey("paymenttypes.id"))
    reason = Column(Text)
    calendar_year = Column(Integer)
    calendar_month = Column(Integer)
    calendar_day = Column(Integer, ForeignKey("calendarday.id"))
    account_period_id = Column(Integer)
    by_who = Column(Integer)

    salary_location = relationship("GennisTeacherSalary", uselist=False, lazy="joined")
    payment_type = relationship("GennisPaymentType", uselist=False, lazy="joined")
    day = relationship("GennisCalendarDay", uselist=False, lazy="joined")
