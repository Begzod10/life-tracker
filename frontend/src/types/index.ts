// Базовые типы из твоей документации
export interface Person {
    id: string
    name: string
    surname: string
    birth_date: string
    email: string
    phone?: string
    location?: {
        city: string
        country: string
    }
    timezone: string
    created_at: string
    updated_at: string
}

export interface Goal {
    id: number | string
    person_id: number | string
    name: string
    description?: string
    category: GoalCategory | string
    target_value?: number
    current_value: number
    unit?: string
    start_date: string
    target_date?: string
    status: GoalStatus
    priority: Priority
    color_code?: string
    icon_name?: string
    progress_percentage?: number
    task_completion_percentage?: number
    created_at: string
    updated_at: string
}

export type GoalCategory =
    | 'learning'
    | 'development'
    | 'skills'
    | 'health'
    | 'career'
    | 'finance'
    | 'personal'

export type GoalStatus =
    | 'active'
    | 'completed'
    | 'paused'
    | 'abandoned'

export type Priority = 'high' | 'medium' | 'low'

// Добавим остальные типы позже по мере необходимости

export interface ProgressLog {
    id: number | string
    goal_id?: number | string
    task_id?: number | string
    value_logged: number
    notes?: string
    mood?: string
    energy_level?: number
    log_date: string
    created_at: string
}

export interface Milestone {
    id: number | string
    goal_id: number | string
    name: string
    description?: string
    target_date: string
    completion_percentage: number
    reward_description?: string
    order_index: number
    achieved?: boolean
    achieved_at?: string
    created_at?: string
    updated_at?: string
}

export interface GoalOverviewStats {
    total_goals: number
    by_status: {
        active: number
        completed: number
        [key: string]: number
    }
    average_completion: number
    total_tasks: number
    total_completed_tasks: number
    overall_task_completion: number
}

export interface FinancialSummary {
    expense_by_category: Record<string, number>
    net_income: number
    period: string
    savings_rate: number
    total_expenses: number
    total_income: number
    total_savings: number
    total_savings_trend?: number
    total_income_trend?: number
    total_expenses_trend?: number
    savings_rate_trend?: number
}