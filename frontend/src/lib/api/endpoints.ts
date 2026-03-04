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
    },

    // Profile
    PROFILE: {
        GET: `${API_URL}/profile`,
        UPDATE: `${API_URL}/profile`,
        DELETE: `${API_URL}/profile`,
        PHOTO: `${API_URL}/profile/photo`,
        PRIVACY: `${API_URL}/profile/privacy`,
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
    },

    // Jobs
    JOBS: {
        CREATE: `${API_URL}/jobs/`,
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
        LIST: (personId: string | number) => `${API_URL}/salary-months/by-person/${personId}`,
        DELETED_LIST: (personId: string | number) => `${API_URL}/salary-months/by-person/${personId}/deleted`,
        UPDATE: (id: string | number) => `${API_URL}/salary-months/${id}`,
        DELETE: (id: string | number) => `${API_URL}/salary-months/${id}`,
    },
    PROGRESSLOG_TASK: {
        CREATE: `${API_URL}/progresslog_task/`,
        GET_BY_TASK: (taskId: string | number) => `${API_URL}/progresslog_task/task/${taskId}`,
    }
}
