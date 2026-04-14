import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
}

export type TimeBlockUpdate = Partial<TimeBlockPayload> & { is_completed?: boolean }

const keys = {
    all: ['timetable'] as const,
    day: (day: string) => ['timetable', 'day', day] as const,
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
