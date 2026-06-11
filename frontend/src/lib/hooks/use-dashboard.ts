'use client'

import { useQuery } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

export type DashboardGoal = {
    id: number
    title: string
    percentage: number
    category: string
    priority: string
}

export type DashboardTimeblock = {
    id: number
    title: string
    start_time: string
    end_time: string
    category: string
    color: string | null
    is_completed: boolean
    is_missed: boolean
}

export type DashboardNewsItem = {
    id: number
    headline: string
    category_label: string
    provider: string
}

export type DashboardFinance = {
    month: string
    spent: number
    budget_allocated: number
    budget_remaining: number
}

export type DashboardSummary = {
    user: { name: string }
    exercises: {
        last_7d_total: number
        last_7d_correct: number
        accuracy_7d: number
        words_due_today: number
    }
    goals: {
        total: number
        active: number
        average_completion: number
        top_active: DashboardGoal[]
    }
    books: {
        currently_reading: number
        pages_last_30d: number
        current_book: {
            id: number
            title: string
            author: string | null
            current_page: number
            total_pages: number
            progress_pct: number
        } | null
    }
    today: {
        date: string
        timeblocks: DashboardTimeblock[]
        timeblocks_total: number
        timeblocks_done: number
    }
    news: {
        today_count: number
        latest: DashboardNewsItem[]
    }
    finance: DashboardFinance
}

export function useDashboardSummary() {
    const { request } = useHttp()
    return useQuery<DashboardSummary>({
        queryKey: ['dashboard', 'summary'],
        queryFn: () => request(API_ENDPOINTS.DASHBOARD.SUMMARY),
        staleTime: 2 * 60 * 1000,
    })
}
