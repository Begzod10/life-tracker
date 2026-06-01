'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

export type PracticeWord = {
    id: number
    word: string
    definition: string
    translation?: string
    phonetic?: string
    examples?: string[]
    difficulty: string
    options: string[]
    // Sentence captured at reader-save time. When present, cloze mode
    // blanks the target word inside this real sentence instead of
    // falling back to a generic example.
    source_sentence?: string | null
    source_book_id?: number | null
    source_page?: number | null
}

export type PracticeSession = {
    id: number
    mode: string
    total_questions: number
    correct_answers: number
    started_at: string
    completed_at?: string
}

export function usePracticeWords(args: {
    count?: number
    difficulty?: string
    moduleId?: number
    folderId?: number
    dueOnly?: boolean
    weakOnly?: boolean
} = {}) {
    const { count = 10, difficulty, moduleId, folderId, dueOnly, weakOnly } = args
    const { request } = useHttp()
    return useQuery<PracticeWord[]>({
        queryKey: ['practice', 'words', count, difficulty ?? '', moduleId ?? '', folderId ?? '', dueOnly ?? false, weakOnly ?? false],
        queryFn: () => request(API_ENDPOINTS.PRACTICE.WORDS(count, difficulty, moduleId, folderId, { dueOnly, weakOnly })),
        enabled: false,
        retry: false,
    })
}

export function useDueCounts(args: { folderId?: number; moduleId?: number } = {}) {
    const { request } = useHttp()
    return useQuery<{ due: number }>({
        queryKey: ['practice', 'due-counts', args.folderId ?? '', args.moduleId ?? ''],
        queryFn: () => request(API_ENDPOINTS.PRACTICE.DUE_COUNTS(args)),
    })
}

export function useSubmitResult() {
    const { request } = useHttp()
    return useMutation({
        mutationFn: ({ wordId, wasCorrect }: { wordId: number; wasCorrect: boolean }) =>
            request(API_ENDPOINTS.PRACTICE.RESULT(wordId, wasCorrect), { method: 'POST' }),
    })
}

export function useCreateSession() {
    const { request } = useHttp()
    return useMutation({
        mutationFn: (mode: string) =>
            request(API_ENDPOINTS.PRACTICE.SESSION(mode), { method: 'POST' }),
    })
}

export function useCompleteSession() {
    const { request } = useHttp()
    return useMutation({
        mutationFn: ({ sessionId, total, correct }: { sessionId: number; total: number; correct: number }) =>
            request(API_ENDPOINTS.PRACTICE.COMPLETE(sessionId, total, correct), { method: 'PUT' }),
    })
}

export function usePracticeHistory(limit = 10) {
    const { request } = useHttp()
    return useQuery<PracticeSession[]>({
        queryKey: ['practice', 'history', limit],
        queryFn: () => request(API_ENDPOINTS.PRACTICE.HISTORY(limit)),
    })
}

/**
 * Daily streak — number of consecutive days with at least one practice
 * session ending in today (or yesterday if you haven't practiced yet today,
 * so the count doesn't flicker to zero until you've actually missed a day).
 */
export function useDailyStreak() {
    // Pull a wide window so long streaks survive a 10-row default.
    const history = usePracticeHistory(120)
    const sessions = history.data ?? []

    const streak = (() => {
        if (sessions.length === 0) return 0
        // Local-day key so a 11pm session and a 1am session count as
        // separate days rather than same-UTC-day.
        const dayKey = (iso: string) => {
            const d = new Date(iso)
            return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        }
        const days = new Set(sessions.map(s => dayKey(s.started_at)))
        const cursor = new Date()
        // Grace period: if no session today, start counting from yesterday so
        // the streak survives until the user has actually skipped a full day.
        if (!days.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) {
            cursor.setDate(cursor.getDate() - 1)
        }
        let count = 0
        while (days.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) {
            count++
            cursor.setDate(cursor.getDate() - 1)
        }
        return count
    })()

    return {
        streak,
        practicedToday: (() => {
            if (sessions.length === 0) return false
            const now = new Date()
            const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
            return sessions.some(s => {
                const d = new Date(s.started_at)
                return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === todayKey
            })
        })(),
        isLoading: history.isLoading,
    }
}
