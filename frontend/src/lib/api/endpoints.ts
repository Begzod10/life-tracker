// src/lib/api/endpoints.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api'
const API_URL_DOC = process.env.NEXT_PUBLIC_API_URL || '/'

export const API_ENDPOINTS = {
    // Auth
    AUTH: {
        LOGIN: `${API_URL}/auth/login`,
        REGISTER: `${API_URL}/auth/register`,
        LOGOUT: `${API_URL}/auth/logout`,
        ME: `${API_URL}/auth/me`,
        REFRESH: `${API_URL}/auth/refresh`,
    },

    // Profile
    PROFILE: {
        GET: `${API_URL}/profile`,
        UPDATE: `${API_URL}/profile`,
        DELETE: `${API_URL}/profile`,
        PHOTO: `${API_URL}/profile/photo`,
        PRIVACY: `${API_URL}/profile/privacy`,
        TELEGRAM: `${API_URL}/profile/telegram`,
        TELEGRAM_TEST: `${API_URL}/profile/telegram/test`,
        TELEGRAM_LINK_CODE: `${API_URL}/profile/telegram/link-code`,
    },

    // Users
    USERS: {
        LIST: `${API_URL}/profiles`,
        GET: (id: string) => `${API_URL}/profiles/${id}`,
    },

    // Goals
    GOALS: {
        LIST: `${API_URL}/goals`,
        GET: (id: string) => `${API_URL}/goals/${id}`,
        GET_WITH_STATS: (id: string) => `${API_URL}/goals/${id}/with-stats`,
        CREATE: `${API_URL}/goals`,
        UPDATE: (id: string) => `${API_URL}/goals/${id}`,
        DELETE: (id: string) => `${API_URL}/goals/${id}`,
        DELETED_LIST: (personId: string | number) => `${API_URL}/goals/deleted/person/${personId}`,
        RESTORE: (id: string | number) => `${API_URL}/goals/${id}/restore`,
        OVERVIEW_STATS: (personId: string) => `${API_URL}/goals/statistics/overview?person_id=${personId}`,
        GET_BY_PERSON: (personId: string | number) => `${API_URL}/goals/person/${personId}`,
    },

    // Tasks
    TASKS: {
        LIST: `${API_URL}/tasks`,
        GET: (id: string) => `${API_URL}/tasks/${id}`,
        CREATE: `${API_URL}/tasks`,
        UPDATE: (id: string) => `${API_URL}/tasks/${id}`,
        DELETE: (id: string) => `${API_URL}/tasks/${id}`,
        BY_GOAL: (goalId: string | number) => `${API_URL}/tasks/goal/${goalId}`,
        BY_PERSON: (personId: string | number) => `${API_URL}/tasks/person/${personId}`,
        RECURRING_COMPLETIONS: (goalId: string | number, weeks = 4) =>
            `${API_URL}/tasks/goal/${goalId}/recurring-completions?weeks=${weeks}`,
        RECURRING_STATS: `${API_URL}/tasks/recurring-stats`,
        COMPLETION_DATES: (taskId: string | number) => `${API_URL}/tasks/${taskId}/completion-dates`,
    },

    // Subtasks
    SUBTASKS: {
        CREATE: `${API_URL}/subtasks`,
        GET_BY_TASK: (taskId: string | number) => `${API_URL}/subtasks/task/${taskId}`,
        UPDATE: (id: string | number) => `${API_URL}/subtasks/${id}`,
        DELETE: (id: string | number) => `${API_URL}/subtasks/${id}`,
    },

    // Habits
    HABITS: {
        LIST: `${API_URL}/habits`,
        GET: (id: string) => `${API_URL}/habits/${id}`,
        CREATE: `${API_URL}/habits`,
        UPDATE: (id: string) => `${API_URL}/habits/${id}`,
        DELETE: (id: string) => `${API_URL}/habits/${id}`,
    },

    // Progress Logs
    PROGRESS_LOGS: {
        CREATE: `${API_URL}/progresslog`,
        GET_BY_GOAL: (goalId: string | number) => `${API_URL}/progresslog/goal/${goalId}`,
        GET: (id: string | number) => `${API_URL}/progresslog/${id}`,
        UPDATE: (id: string | number) => `${API_URL}/progresslog/${id}`,
        DELETE: (id: string | number) => `${API_URL}/progresslog/${id}`,
    },

    // Milestones
    MILESTONES: {
        CREATE: `${API_URL}/milestones`,
        LIST: `${API_URL}/milestones`,
        GET_BY_GOAL: (goalId: string | number) => `${API_URL}/milestones/goal/${goalId}`,
        UPDATE: (id: string | number) => `${API_URL}/milestones/${id}`,
        DELETE: (id: string | number) => `${API_URL}/milestones/${id}`,
    },

    // Financial Analytics
    FINANCIAL_ANALYTICS: {
        MONTHLY_SUMMARY: (month: string) => `${API_URL}/financial-analytics/monthly-summary/${month}`,
        MONTHLY_REPORT: (month: string) => `${API_URL}/financial-analytics/monthly-report/${month}`,
        NET_WORTH: `${API_URL}/financial-analytics/net-worth`,
        SPENDING_TRENDS: (months = 6) => `${API_URL}/financial-analytics/spending-trends?months=${months}`,
        CATEGORY_ANALYSIS: (months = 3) => `${API_URL}/financial-analytics/category-analysis?months=${months}`,
        INCOME_VS_EXPENSES: (months = 6) => `${API_URL}/financial-analytics/income-vs-expenses?months=${months}`,
    },

    // Jobs
    JOBS: {
        CREATE: `${API_URL}/jobs/`,
        GET: (id: string | number) => `${API_URL}/jobs/${id}`,
        LIST: (personId: string | number) => `${API_URL}/jobs/by-person/${personId}`,
        LIST_DELETED: (personId: string | number) => `${API_URL}/jobs/deleted/by-person/${personId}`,
        UPDATE: (id: string | number) => `${API_URL}/jobs/${id}`,
        DELETE: (id: string | number) => `${API_URL}/jobs/${id}`,
    },

    EXPENSES: {
        CREATE: `${API_URL}/expenses/`,
        LIST: (personId: string | number) => `${API_URL}/expenses/by-person/${personId}`,
        DELETED_LIST: (personId: string | number) => `${API_URL}/expenses/by-person/${personId}/deleted`,
        LIST_BY_SAVING: (savingId: string | number) => `${API_URL}/expenses/by-saving/${savingId}`,
        UPDATE: (id: string | number) => `${API_URL}/expenses/${id}`,
        DELETE: (id: string | number) => `${API_URL}/expenses/${id}`,
    },

    // Budgets
    BUDGETS: {
        CREATE: `${API_URL}/budgets/`,
        LIST: (personId: string | number) => `${API_URL}/budgets/by-person/${personId}`,
        DELETED_LIST: (personId: string | number) => `${API_URL}/budgets/by-person/${personId}/deleted`,
        UPDATE: (id: string | number) => `${API_URL}/budgets/${id}`,
        DELETE: (id: string | number) => `${API_URL}/budgets/${id}`,
    },
    // Income Sources
    INCOME_SOURCES: {
        CREATE: `${API_URL}/income-sources/`,
        LIST: (personId: string | number) => `${API_URL}/income-sources/by-person/${personId}`,
        DELETED_LIST: (personId: string | number) => `${API_URL}/income-sources/by-person/${personId}/deleted`,
        UPDATE: (id: string | number) => `${API_URL}/income-sources/${id}`,
        DELETE: (id: string | number) => `${API_URL}/income-sources/${id}`,
    },
    // Savings
    SAVINGS: {
        CREATE: `${API_URL}/savings/`,
        GET: (id: string | number) => `${API_URL}/savings/${id}`,
        LIST: (personId: string | number) => `${API_URL}/savings/by-person/${personId}`,
        DELETED_LIST: (personId: string | number) => `${API_URL}/savings/by-person/${personId}/deleted`,
        UPDATE: (id: string | number) => `${API_URL}/savings/${id}`,
        DELETE: (id: string | number) => `${API_URL}/savings/${id}`,
    },
    SAVINGS_TRANSACTIONS: {
        LIST: (savingId: string | number) => `${API_URL}/savings/${savingId}/transactions`,
        CREATE: (savingId: string | number) => `${API_URL}/savings/${savingId}/transactions`,
        DELETE: (savingId: string | number, transactionId: string | number) =>
            `${API_URL}/savings/${savingId}/transactions/${transactionId}`,
    },
    SALARY_MONTHS: {
        CREATE: `${API_URL}/salary-months/`,
        GET: (id: string | number) => `${API_URL}/salary-months/${id}`,
        LIST: (personId: string | number) => `${API_URL}/salary-months/by-person/${personId}`,
        DELETED_LIST: (personId: string | number) => `${API_URL}/salary-months/by-person/${personId}/deleted`,
        UPDATE: (id: string | number) => `${API_URL}/salary-months/${id}`,
        DELETE: (id: string | number) => `${API_URL}/salary-months/${id}`,
        EXPENSES: (id: string | number) => `${API_URL}/salary-months/${id}/expenses`,
        GENNIS_PAYMENTS: (id: string | number) => `${API_URL}/salary-months/${id}/gennis-payments`,
    },
    PROGRESSLOG_TASK: {
        CREATE: `${API_URL}/progresslog_task/`,
        GET_BY_TASK: (taskId: string | number) => `${API_URL}/progresslog_task/task/${taskId}`,
        DELETE: (id: string | number) => `${API_URL}/progresslog_task/${id}`,
        UPDATE: (id: string | number) => `${API_URL}/progresslog_task/${id}`,
    },

    AI_COACH: {
        CHAT: `${API_URL}/ai/chat`,
        CREATE_TASKS: `${API_URL}/ai/create-tasks`,
    },

    DICTIONARY: {
        LIST: `${API_URL}/dictionary/`,
        CREATE: `${API_URL}/dictionary/`,
        UPDATE: (id: number) => `${API_URL}/dictionary/${id}`,
        DELETE: (id: number) => `${API_URL}/dictionary/${id}`,
        STATS: (args: { folderId?: number; moduleId?: number } = {}) => {
            const p = new URLSearchParams()
            if (args.folderId) p.set('folder_id', String(args.folderId))
            if (args.moduleId) p.set('module_id', String(args.moduleId))
            const qs = p.toString()
            return qs ? `${API_URL}/dictionary/stats?${qs}` : `${API_URL}/dictionary/stats`
        },
        AI_WORD_DETAILS: `${API_URL}/dictionary/ai/word-details`,
        AI_GENERATE_MODULE: `${API_URL}/dictionary/ai/generate-module`,
        AI_EXTRACT_VOCAB: `${API_URL}/dictionary/ai/extract-vocab`,
        FOLDERS: `${API_URL}/dictionary/folders/`,
        FOLDER: (id: number) => `${API_URL}/dictionary/folders/${id}`,
        MODULES: `${API_URL}/dictionary/modules/`,
        MODULE: (id: number) => `${API_URL}/dictionary/modules/${id}`,
    },

    PRACTICE: {
        WORDS: (
            count = 10,
            difficulty?: string,
            moduleId?: number,
            folderId?: number,
            extra?: { dueOnly?: boolean; weakOnly?: boolean },
        ) => {
            const p = new URLSearchParams({ count: String(count) })
            if (difficulty) p.append('difficulty', difficulty)
            if (moduleId) p.append('module_id', String(moduleId))
            if (folderId) p.append('folder_id', String(folderId))
            if (extra?.dueOnly) p.append('due_only', 'true')
            if (extra?.weakOnly) p.append('weak_only', 'true')
            return `${API_URL}/practice/words?${p}`
        },
        WORDS_BY_IDS: (ids: number[]) =>
            `${API_URL}/practice/words?ids=${ids.join(',')}`,
        DUE_COUNTS: (args: { folderId?: number; moduleId?: number } = {}) => {
            const p = new URLSearchParams()
            if (args.folderId) p.set('folder_id', String(args.folderId))
            if (args.moduleId) p.set('module_id', String(args.moduleId))
            const qs = p.toString()
            return qs ? `${API_URL}/practice/due-counts?${qs}` : `${API_URL}/practice/due-counts`
        },
        RESULT: (wordId: number, wasCorrect: boolean, grade?: 0 | 1 | 2) => {
            const base = `${API_URL}/practice/result?word_id=${wordId}&was_correct=${wasCorrect}`
            // grade overrides was_correct on the server side. Typed-answer
            // modes (spelling/listening/cloze) pass grade so a "close"
            // answer gets a smaller interval bump + ease penalty instead
            // of being marked wholly correct.
            return grade === undefined ? base : `${base}&grade=${grade}`
        },
        SESSION: (mode: string) => `${API_URL}/practice/session?mode=${mode}`,
        COMPLETE: (sessionId: number, total: number, correct: number) =>
            `${API_URL}/practice/session/${sessionId}/complete?total_questions=${total}&correct_answers=${correct}`,
        ACTIVE_SESSION: `${API_URL}/practice/session/active`,
        PROGRESS: (sessionId: number) => `${API_URL}/practice/session/${sessionId}/progress`,
        DISCARD: (sessionId: number) => `${API_URL}/practice/session/${sessionId}`,
        HISTORY: (limit = 10) => `${API_URL}/practice/history?limit=${limit}`,
        JUDGE_ANSWER: `${API_URL}/practice/judge-answer`,
    },

    ESSAYS: {
        LIST: (status?: string) => status
            ? `${API_URL}/essays?status=${encodeURIComponent(status)}`
            : `${API_URL}/essays`,
        CREATE: `${API_URL}/essays`,
        GET: (id: number) => `${API_URL}/essays/${id}`,
        UPDATE: (id: number) => `${API_URL}/essays/${id}`,
        DELETE: (id: number) => `${API_URL}/essays/${id}`,
        PROMPT: `${API_URL}/essays/prompt`,
        QUICK_CHECK: (id: number) => `${API_URL}/essays/${id}/quick-check`,
        DEEP_REVIEW: (id: number) => `${API_URL}/essays/${id}/deep-review`,
        ATTEMPTS: (id: number) => `${API_URL}/essays/${id}/attempts`,
        ERRORS: (args: { kind?: string; level?: string; essayId?: number; limit?: number } = {}) => {
            const p = new URLSearchParams()
            if (args.kind) p.set('kind', args.kind)
            if (args.level) p.set('level', args.level)
            if (args.essayId !== undefined) p.set('essay_id', String(args.essayId))
            if (args.limit) p.set('limit', String(args.limit))
            const qs = p.toString()
            return qs ? `${API_URL}/essays/errors/list?${qs}` : `${API_URL}/essays/errors/list`
        },
        STATS: (days = 60) => `${API_URL}/essays/stats/overview?days=${days}`,
        PLAN: (id: number) => `${API_URL}/essays/${id}/plan`,
        DRILLS_DUE: (args: { kind?: string; level?: string; limit?: number } = {}) => {
            const p = new URLSearchParams()
            if (args.kind) p.set('kind', args.kind)
            if (args.level) p.set('level', args.level)
            if (args.limit) p.set('limit', String(args.limit))
            const qs = p.toString()
            return qs
                ? `${API_URL}/essays/errors/drills/due?${qs}`
                : `${API_URL}/essays/errors/drills/due`
        },
        DRILLS_SUMMARY: `${API_URL}/essays/errors/drills/summary`,
        DRILL_REVIEW: (id: number) => `${API_URL}/essays/errors/${id}/review`,
        DRILL_ARCHIVE: (id: number) => `${API_URL}/essays/errors/${id}/archive`,
    },

    BOOKS: {
        LIST: (status?: string) => status
            ? `${API_URL}/books?status=${encodeURIComponent(status)}`
            : `${API_URL}/books`,
        CREATE: `${API_URL}/books`,
        GET: (id: number) => `${API_URL}/books/${id}`,
        UPDATE: (id: number) => `${API_URL}/books/${id}`,
        DELETE: (id: number, hard = false) =>
            hard ? `${API_URL}/books/${id}?hard=true` : `${API_URL}/books/${id}`,
        FILE: (id: number) => `${API_URL}/books/${id}/file`,
        HIGHLIGHTS: (id: number) => `${API_URL}/books/${id}/highlights`,
        HIGHLIGHT: (id: number, highlightId: number) => `${API_URL}/books/${id}/highlights/${highlightId}`,
        HIGHLIGHT_REFRESH_DEFINITION: (id: number, highlightId: number) =>
            `${API_URL}/books/${id}/highlights/${highlightId}/refresh-definition`,
        SESSIONS: (id: number) => `${API_URL}/books/${id}/sessions`,
        STATS: `${API_URL}/books/stats/overview`,
    },

    DASHBOARD: {
        SUMMARY: `${API_URL}/dashboard/summary`,
    },

    EXERCISES: {
        WORDS: (args: {
            count?: number
            difficulty?: string
            moduleId?: number
            folderId?: number
            source?: string
        } = {}) => {
            const p = new URLSearchParams({ count: String(args.count ?? 5) })
            if (args.difficulty) p.append('difficulty', args.difficulty)
            if (args.moduleId) p.append('module_id', String(args.moduleId))
            if (args.folderId) p.append('folder_id', String(args.folderId))
            if (args.source && args.source !== 'smart') p.append('source', args.source)
            return `${API_URL}/exercises/words?${p}`
        },
        START: `${API_URL}/exercises/start`,
        GRADE: `${API_URL}/exercises/grade`,
        HISTORY: (limit = 20, wordId?: number, fromDate?: string, toDate?: string) => {
            const p = new URLSearchParams({ limit: String(limit) })
            if (wordId) p.append('word_id', String(wordId))
            if (fromDate) p.append('from_date', fromDate)
            if (toDate) p.append('to_date', toDate)
            return `${API_URL}/exercises/history?${p}`
        },
        STATS: `${API_URL}/exercises/stats`,
        ANALYTICS: (days = 30, fromDate?: string, toDate?: string) => {
            const p = new URLSearchParams({ days: String(days) })
            if (fromDate) p.append('from_date', fromDate)
            if (toDate) p.append('to_date', toDate)
            return `${API_URL}/exercises/analytics?${p}`
        },
    },

    TASK2: {
        START:              `${API_URL}/essays/task2/start`,
        GRADE:              `${API_URL}/essays/task2/grade`,
        HISTORY:            (page = 1, limit = 20) => `${API_URL}/essays/task2/history?page=${page}&limit=${limit}`,
        ANALYTICS:          `${API_URL}/essays/task2/analytics`,
        GRAMMAR_DRILL_QUEUE: (limit = 10) => `${API_URL}/essays/task2/grammar/drill-queue?limit=${limit}`,
        GRAMMAR_POINTS:      `${API_URL}/essays/task2/grammar/points`,
    },

    PARAPHRASE: {
        NEXT:    `${API_URL}/essays/paraphrase/next`,
        GRADE:   `${API_URL}/essays/paraphrase/grade`,
        HISTORY: (limit = 20) => `${API_URL}/essays/paraphrase/history?limit=${limit}`,
        STATS:   `${API_URL}/essays/paraphrase/stats`,
    },

    GAP_FILL: {
        NEXT:    `${API_URL}/essays/gap-fill/next`,
        GRADE:   `${API_URL}/essays/gap-fill/grade`,
        HISTORY: (limit = 20) => `${API_URL}/essays/gap-fill/history?limit=${limit}`,
        STATS:   `${API_URL}/essays/gap-fill/stats`,
    },

    ERROR_HUNT: {
        NEXT:  `${API_URL}/essays/task2/grammar/error-hunt`,
        GRADE: `${API_URL}/essays/task2/grammar/error-hunt/grade`,
    },

    MINI_BUILD: {
        START:   `${API_URL}/essays/mini-build/start`,
        GRADE:   `${API_URL}/essays/mini-build/grade`,
        HISTORY: (limit = 20) => `${API_URL}/essays/mini-build/history?limit=${limit}`,
        STATS:   `${API_URL}/essays/mini-build/stats`,
    },

    TIMETABLE: {
        STATS: (weeks = 4, fromDate?: string, toDate?: string) =>
            fromDate && toDate
                ? `${API_URL}/timetable/stats?weeks=${weeks}&from_date=${fromDate}&to_date=${toDate}`
                : `${API_URL}/timetable/stats?weeks=${weeks}`,
        LIST: (dateFrom?: string, dateTo?: string) => {
            const params = new URLSearchParams()
            if (dateFrom) params.append('date_from', dateFrom)
            if (dateTo) params.append('date_to', dateTo)
            const qs = params.toString()
            return `${API_URL}/timetable/${qs ? `?${qs}` : ''}`
        },
        BY_DAY: (day: string) => `${API_URL}/timetable/day/${day}`,
        CREATE: `${API_URL}/timetable/`,
        UPDATE: (id: string | number) => `${API_URL}/timetable/${id}`,
        DELETE: (id: string | number) => `${API_URL}/timetable/${id}`,
        TOGGLE: (id: string | number) => `${API_URL}/timetable/${id}/toggle`,
        CONCLUSIONS: (limit = 30) => `${API_URL}/timetable/conclusions?limit=${limit}`,
        GENERATE_CONCLUSION: `${API_URL}/timetable/conclusions/generate`,
        AUTO_SCHEDULE: (goalId: string | number) => `${API_URL}/timetable/auto-schedule/${goalId}`,
        BULK_RESCHEDULE: `${API_URL}/timetable/bulk-reschedule`,
        FROZEN_DAYS: (dateFrom?: string, dateTo?: string) => {
            const params = new URLSearchParams()
            if (dateFrom) params.append('date_from', dateFrom)
            if (dateTo) params.append('date_to', dateTo)
            const qs = params.toString()
            return `${API_URL}/timetable/frozen-days${qs ? `?${qs}` : ''}`
        },
        FREEZE_DAY: `${API_URL}/timetable/freeze`,
        UNFREEZE_DAY: (d: string) => `${API_URL}/timetable/freeze/${d}`,
        CATEGORY_BUDGETS: `${API_URL}/category-budgets/`,
        CATEGORY_BUDGET: (category: string) => `${API_URL}/category-budgets/${encodeURIComponent(category)}`,
    },

    DAILY_LOG: {
        LIST: (limit = 30) => `${API_URL}/daily-log/?limit=${limit}`,
        BY_DATE: (date: string) => `${API_URL}/daily-log/${date}`,
        UPSERT: (date: string) => `${API_URL}/daily-log/${date}`,
        ANALYZE: (date: string) => `${API_URL}/daily-log/${date}/analyze`,
    },

    NEWS: {
        CATEGORIES: `${API_URL}/news/categories`,
        ITEMS: (date?: string) => date ? `${API_URL}/news/?date=${date}` : `${API_URL}/news/`,
        DATES: (from?: string, to?: string) => {
            const params = new URLSearchParams()
            if (from) params.append('from', from)
            if (to) params.append('to', to)
            const qs = params.toString()
            return `${API_URL}/news/dates${qs ? `?${qs}` : ''}`
        },
        FETCH: (date?: string) => date ? `${API_URL}/news/fetch?date=${date}` : `${API_URL}/news/fetch`,
        ITEM: (id: number) => `${API_URL}/news/${id}`,
    },
}
