'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

// ─── Resume support ─────────────────────────────────────────────────────────

/**
 * Chunk-boundary snapshot the practice page writes back to the server
 * so a paused drill can be resumed later. Stored opaquely in
 * practice_sessions.progress (JSONB) — the backend never inspects it.
 *
 * Word IDs are persisted (not full word objects) so a resume always
 * fetches fresh definitions/source data via /practice/words?ids=...
 * — if the learner edited a word between sessions, the resumed drill
 * picks up the new version instead of stale JSON.
 */
export type PracticeProgress = {
    version: 1
    mode: string                       // matches `Mode` union on the page
    chunkSize: number
    scope: {
        folderId: number | null
        moduleId: number | null
        dueOnly: boolean
        weakOnly: boolean
    }
    originalIds: number[]              // the full shuffled pool we sourced from
    unseenIds: number[]                // not yet shown this run
    mistakesIds: number[]              // carry-forward — re-test these next chunk
    aggregate: {
        correct: number
        total: number
        missedIds: number[]            // unique miss list across the whole drill
    }
}

export type ActiveSession = {
    id: number
    mode: string
    started_at: string
    progress: PracticeProgress
}

export function useActiveSession() {
    const { request } = useHttp()
    return useQuery<ActiveSession | null>({
        queryKey: ['practice', 'active-session'],
        queryFn: () => request(API_ENDPOINTS.PRACTICE.ACTIVE_SESSION),
        // Resume should feel snappy if the user bounces back — but the
        // active session can also change behind the scenes (completed
        // in another tab, discarded). Short stale window so we revalidate
        // on focus without spamming on every click.
        staleTime: 5_000,
    })
}

export function useUpdateSessionProgress() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ sessionId, progress }: { sessionId: number; progress: PracticeProgress }) =>
            request(API_ENDPOINTS.PRACTICE.PROGRESS(sessionId), {
                method: 'PUT',
                body: { progress },
            }),
        // Don't invalidate practice queries on every chunk — the active
        // session shape isn't visible until the user returns to the
        // landing screen anyway, and invalidation would interrupt mid-
        // drill in flight.
        onSuccess: () => qc.invalidateQueries({ queryKey: ['practice', 'active-session'] }),
    })
}

export function useDiscardSession() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (sessionId: number) =>
            request(API_ENDPOINTS.PRACTICE.DISCARD(sessionId), { method: 'DELETE' }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['practice', 'active-session'] }),
    })
}

/** Fetch specific words by ID for resume rehydration. Lazy: caller
 *  triggers via `.refetch()` so the load is tied to the Resume click. */
export function usePracticeWordsByIds(ids: number[]) {
    const { request } = useHttp()
    return useQuery<PracticeWord[]>({
        queryKey: ['practice', 'words-by-ids', ids.join(',')],
        queryFn: () => request(API_ENDPOINTS.PRACTICE.WORDS_BY_IDS(ids)),
        enabled: false,
        retry: false,
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
