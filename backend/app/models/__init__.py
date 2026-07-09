"""
SQLAlchemy model package for Life Tracker.

All submodules are imported here so every mapper is registered with Base
before any query runs. Both import styles continue to work:

  from app import models          (models.Person, models.Goal, …)
  from app.models import Person   (direct name import)
"""

from app.models.person import Person
from app.models.goals import Goal, Milestone, Task, SubTasks, ProgressLog, ProgressLogTask
from app.models.finance import (
    Job,
    SalaryMonth,
    Expense,
    IncomeSource,
    Saving,
    SavingTransaction,
    GennisSalaryPayment,
    Budget,
)
from app.models.timetable import TimeBlock, FrozenDay, CategoryBudget, DailyConclusion
from app.models.library import Book, ReadingSession, BookHighlight
from app.models.learning import (
    DictionaryFolder,
    DictionaryModule,
    DictionaryWord,
    PracticeSession,
    ExerciseAttempt,
    UserGrammarPoint,
)
from app.models.writing import (
    Essay,
    EssayAttempt,
    EssayError,
    EssayPlan,
    EssaySession,
    Task2Attempt,
    ParaphraseAttempt,
    GapFillAttempt,
    MiniBuildAttempt,
)
from app.models.news import NewsCategory, NewsItem, UserNewsCategory
from app.models.daily_log import DailyLog

__all__ = [
    # person
    "Person",
    # goals
    "Goal",
    "Milestone",
    "Task",
    "SubTasks",
    "ProgressLog",
    "ProgressLogTask",
    # finance
    "Job",
    "SalaryMonth",
    "Expense",
    "IncomeSource",
    "Saving",
    "SavingTransaction",
    "GennisSalaryPayment",
    "Budget",
    # timetable
    "TimeBlock",
    "FrozenDay",
    "CategoryBudget",
    "DailyConclusion",
    # library
    "Book",
    "ReadingSession",
    "BookHighlight",
    # learning
    "DictionaryFolder",
    "DictionaryModule",
    "DictionaryWord",
    "PracticeSession",
    "ExerciseAttempt",
    "UserGrammarPoint",
    # writing
    "Essay",
    "EssayAttempt",
    "EssayError",
    "EssayPlan",
    "EssaySession",
    "Task2Attempt",
    "ParaphraseAttempt",
    "GapFillAttempt",
    "MiniBuildAttempt",
    # news
    "NewsCategory",
    "NewsItem",
    "UserNewsCategory",
    # daily log
    "DailyLog",
]
