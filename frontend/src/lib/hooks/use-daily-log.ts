import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'

export type DailyLog = {
    id: number
    person_id: number
    date: string
    mood: number | null
    energy: number | null
    journal: string | null
    wins: string | null
    challenges: string | null
    improvements: string | null
    intention_1: string | null
    intention_2: string | null
    intention_3: string | null
    ai_reflection: string | null
    created_at: string
    updated_at: string
}

export type DailyLogPayload = {
    date: string
    mood?: number | null
    energy?: number | null
    journal?: string | null
    wins?: string | null
    challenges?: string | null
    improvements?: string | null
    intention_1?: string | null
    intention_2?: string | null
    intention_3?: string | null
}

const keys = {
    all: ['daily-log'] as const,
    byDate: (date: string) => ['daily-log', date] as const,
}

export function useDailyLog(date: string) {
    const { request } = useHttp()
    return useQuery<DailyLog>({
        queryKey: keys.byDate(date),
        queryFn: () => request(API_ENDPOINTS.DAILY_LOG.BY_DATE(date)),
        retry: false,
    })
}

export function useDailyLogList(limit = 30) {
    const { request } = useHttp()
    return useQuery<DailyLog[]>({
        queryKey: [...keys.all, limit],
        queryFn: () => request(API_ENDPOINTS.DAILY_LOG.LIST(limit)),
    })
}

export function useDailyLogUpsert() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (payload: DailyLogPayload) =>
            request<DailyLog>(API_ENDPOINTS.DAILY_LOG.UPSERT(payload.date), {
                method: 'PUT',
                body: payload,
            }),
        onSuccess: (data) => {
            qc.setQueryData(keys.byDate(data.date), data)
            qc.invalidateQueries({ queryKey: keys.all })
        },
    })
}

export function useDailyLogAnalyze() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (date: string) =>
            request<DailyLog>(API_ENDPOINTS.DAILY_LOG.ANALYZE(date), { method: 'POST' }),
        onSuccess: (data) => {
            qc.setQueryData(keys.byDate(data.date), data)
        },
    })
}
