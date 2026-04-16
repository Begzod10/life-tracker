import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'

export type TimeBlock = {
    id: number
    person_id: number
    title: string
    description?: string
    date: string         // "YYYY-MM-DD"
    start_time: string   // "HH:MM"
    end_time: string     // "HH:MM"
    category: string
    color?: string
    is_completed: boolean
    is_missed: boolean
    is_recurring: boolean
    task_id?: number
    deleted: boolean
    created_at: string
    updated_at: string
}

export type TimeBlockPayload = {
    title: string
    description?: string
    date: string
    start_time: string
    end_time: string
    category?: string
    color?: string
    task_id?: number
    is_recurring?: boolean
}

export type TimeBlockUpdate = Partial<TimeBlockPayload> & { is_completed?: boolean; is_recurring?: boolean }

export type TimetableStats = {
    period: { from: string; to: string }
    weeks: number
    total_blocks: number
    completed_blocks: number
    missed_blocks: number
    completion_rate: number
    missed_rate: number
    total_hours: number
    completed_hours: number
    missed_hours: number
    recurring_count: number
    streak_days: number
    by_category: { category: string; count: number; hours: number; completed: number; missed: number }[]
    by_weekday: { weekday: number; name: string; count: number; hours: number; completed: number; missed: number }[]
    by_hour: { hour: number; count: number }[]
    daily_summary: { date: string; total: number; completed: number; missed: number; hours: number }[]
}

const keys = {
    all: ['timetable'] as const,
    day: (day: string) => ['timetable', 'day', day] as const,
    stats: (weeks: number) => ['timetable', 'stats', weeks] as const,
}

export interface DailyConclusion {
    date: string
    conclusion: string
    created_at: string
}

export function useDailyConclusions(limit = 30) {
    const { request } = useHttp()
    return useQuery<DailyConclusion[]>({
        queryKey: ['timetable', 'conclusions', limit],
        queryFn: () => request(API_ENDPOINTS.TIMETABLE.CONCLUSIONS(limit)),
    })
}

export function useTimetableStats(weeks = 4) {
    const { request } = useHttp()
    return useQuery<TimetableStats>({
        queryKey: keys.stats(weeks),
        queryFn: () => request(API_ENDPOINTS.TIMETABLE.STATS(weeks)),
    })
}

export function useTimeBlocksByDays(days: string[]) {
    const { request } = useHttp()
    return useQueries({
        queries: days.map(day => ({
            queryKey: keys.day(day),
            queryFn: () => request<TimeBlock[]>(API_ENDPOINTS.TIMETABLE.BY_DAY(day)),
            enabled: !!day,
        })),
    })
}

export function useTimeBlocksByDay(day: string) {
    const { request } = useHttp()
    return useQuery<TimeBlock[]>({
        queryKey: keys.day(day),
        queryFn: () => request(API_ENDPOINTS.TIMETABLE.BY_DAY(day)),
        enabled: !!day,
    })
}

export function useTimeBlockCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (data: TimeBlockPayload) =>
            request(API_ENDPOINTS.TIMETABLE.CREATE, { method: 'POST', body: data }),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: keys.day(variables.date) })
        },
    })
}

export function useTimeBlockUpdate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: TimeBlockUpdate }) =>
            request(API_ENDPOINTS.TIMETABLE.UPDATE(id), { method: 'PUT', body: data }),
        onSuccess: (result: TimeBlock) => {
            queryClient.invalidateQueries({ queryKey: keys.day(result.date) })
        },
    })
}

export function useTimeBlockDelete() {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, date }: { id: number; date: string }) =>
            request(API_ENDPOINTS.TIMETABLE.DELETE(id), { method: 'DELETE' }),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: keys.day(variables.date) })
        },
    })
}

export function useTimeBlockToggle() {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, date }: { id: number; date: string }) =>
            request(API_ENDPOINTS.TIMETABLE.TOGGLE(id), { method: 'PATCH' }),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: keys.day(variables.date) })
        },
    })
}
