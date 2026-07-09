"""
Pydantic schema package for Life Tracker.

All submodules are imported here so both access patterns work:
  from app import schemas          → schemas.Goal, schemas.Person, …
  from app.schemas import Goal     → direct name import
"""

from app.schemas.person import Person, PersonBase, PersonCreate, PersonUpdate

from app.schemas.goals import (
    Goal,
    GoalBase,
    GoalCreate,
    GoalUpdate,
    GoalWithStats,
    Milestone,
    MilestoneBase,
    MilestoneCreate,
    MilestoneUpdate,
    ProgressLog,
    ProgressLogBase,
    ProgressLogCreate,
    ProgressLogTaskCreate,
    ProgressLogTaskUpdate,
    ProgressLogUpdate,
    ProgressTaskLog,
    RecurringCompletionTask,
    SubTask,
    SubTaskBase,
    SubTaskCreate,
    SubTaskUpdate,
    Task,
    TaskBase,
    TaskCreate,
    TaskStatistics,
    TaskUpdate,
)

from app.schemas.finance import (
    Budget,
    BudgetBase,
    BudgetCreate,
    BudgetUpdate,
    Expense,
    ExpenseBase,
    ExpenseCreate,
    ExpenseUpdate,
    FinancialSummary,
    GennisSalaryPayment,
    IncomeSource,
    IncomeSourceBase,
    IncomeSourceCreate,
    IncomeSourceUpdate,
    Job,
    JobBase,
    JobCreate,
    JobUpdate,
    MonthlyFinancialReport,
    Saving,
    SavingAccountMonthlySummary,
    SavingBase,
    SavingCreate,
    SavingDepositWithdrawBody,
    SavingMonthlySummaryItem,
    SavingTransaction,
    SavingTransactionBase,
    SavingTransactionCreate,
    SavingTransactionUpdate,
    SavingUpdate,
    SalaryMonth,
    SalaryMonthBase,
    SalaryMonthCreate,
    SalaryMonthGenerateResponse,
    SalaryMonthUpdate,
    SalaryMonthWithJob,
    SavingsAggregatedMonthlySummary,
    SavingsAggregatedMonthlySummaryItem,
)

from app.schemas.timetable import (
    TimeBlock,
    TimeBlockBase,
    TimeBlockCreate,
    TimeBlockUpdate,
)

from app.schemas.learning import (
    DictionaryFolderCreate,
    DictionaryFolderRead,
    DictionaryFolderUpdate,
    DictionaryModuleCreate,
    DictionaryModuleRead,
    DictionaryModuleUpdate,
    DictionaryWordCreate,
    DictionaryWordRead,
    DictionaryWordUpdate,
    PracticeSessionRead,
)

from app.schemas.writing import (
    EssayCreate,
    EssayErrorReview,
    EssayExistingTopicRef,
    EssayListItem,
    EssayPlanBody,
    EssayPlanRead,
    EssayPlanWrite,
    EssayPromptRequest,
    EssayPromptResponse,
    EssayRead,
    EssayUpdate,
)

from app.schemas.library import (
    BookCreate,
    BookHighlightCreate,
    BookHighlightRead,
    BookHighlightUpdate,
    BookListResponse,
    BookRead,
    BookUpdate,
    ReadingSessionCreate,
    ReadingSessionRead,
)

from app.schemas.news import (
    NewsCategoryPickWrite,
    NewsCategoryRead,
    NewsFetchSummary,
    NewsItemRead,
)

__all__ = [
    # person
    "Person", "PersonBase", "PersonCreate", "PersonUpdate",
    # goals
    "Goal", "GoalBase", "GoalCreate", "GoalUpdate", "GoalWithStats",
    "Milestone", "MilestoneBase", "MilestoneCreate", "MilestoneUpdate",
    "Task", "TaskBase", "TaskCreate", "TaskUpdate", "TaskStatistics",
    "RecurringCompletionTask",
    "SubTask", "SubTaskBase", "SubTaskCreate", "SubTaskUpdate",
    "ProgressLog", "ProgressLogBase", "ProgressLogCreate", "ProgressLogUpdate",
    "ProgressLogTaskCreate", "ProgressLogTaskUpdate", "ProgressTaskLog",
    # finance
    "Job", "JobBase", "JobCreate", "JobUpdate",
    "SalaryMonth", "SalaryMonthBase", "SalaryMonthCreate", "SalaryMonthUpdate",
    "SalaryMonthWithJob", "SalaryMonthGenerateResponse",
    "Expense", "ExpenseBase", "ExpenseCreate", "ExpenseUpdate",
    "GennisSalaryPayment",
    "IncomeSource", "IncomeSourceBase", "IncomeSourceCreate", "IncomeSourceUpdate",
    "Saving", "SavingBase", "SavingCreate", "SavingUpdate",
    "SavingTransaction", "SavingTransactionBase", "SavingTransactionCreate",
    "SavingTransactionUpdate", "SavingDepositWithdrawBody",
    "SavingMonthlySummaryItem", "SavingAccountMonthlySummary",
    "SavingsAggregatedMonthlySummaryItem", "SavingsAggregatedMonthlySummary",
    "Budget", "BudgetBase", "BudgetCreate", "BudgetUpdate",
    "FinancialSummary", "MonthlyFinancialReport",
    # timetable
    "TimeBlock", "TimeBlockBase", "TimeBlockCreate", "TimeBlockUpdate",
    # learning
    "DictionaryFolderCreate", "DictionaryFolderUpdate", "DictionaryFolderRead",
    "DictionaryModuleCreate", "DictionaryModuleUpdate", "DictionaryModuleRead",
    "DictionaryWordCreate", "DictionaryWordUpdate", "DictionaryWordRead",
    "PracticeSessionRead",
    # writing
    "EssayPromptRequest", "EssayExistingTopicRef", "EssayPromptResponse",
    "EssayCreate", "EssayUpdate", "EssayRead", "EssayListItem",
    "EssayErrorReview", "EssayPlanBody", "EssayPlanWrite", "EssayPlanRead",
    # library
    "BookCreate", "BookUpdate", "BookRead", "BookListResponse",
    "ReadingSessionCreate", "ReadingSessionRead",
    "BookHighlightCreate", "BookHighlightRead", "BookHighlightUpdate",
    # news
    "NewsCategoryRead", "NewsCategoryPickWrite", "NewsItemRead", "NewsFetchSummary",
]
