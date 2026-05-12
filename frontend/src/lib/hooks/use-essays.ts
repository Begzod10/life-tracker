'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

// ─── Types ───────────────────────────────────────────────────────────────────

export type EssayLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export type EssayQuickFeedback = {
    level_estimate?: string
    strengths: string[]
    improvements: string[]
    suggestions: string[]
}

export type EssayDeepSentence = {
    original: string
    issue: string
    explanation: string
    suggestion: string
}

export type EssayVocabUpgrade = {
    from: string
    to: string
    why: string
}

export type EssayDeepReview = {
    level_estimate?: string
    overall: string
    criteria: {
        task_response: number
        coherence_cohesion: number
        vocabulary: number
        grammar: number
    }
    sentences: EssayDeepSentence[]
    vocabulary_upgrades: EssayVocabUpgrade[]
}

export type EssayListItem = {
    id: number
    title: string | null
    prompt: string
    level: EssayLevel
    status: 'draft' | 'submitted'
    word_count: number
    target_word_count: number | null
    quick_score: number | null
    deep_score: number | null
    created_at: string
    updated_at: string | null
}

export type Essay = {
    id: number
    title: string | null
    prompt: string
    body: string
    level: EssayLevel
    target_word_count: number | null
    target_words: string[]
    status: 'draft' | 'submitted'
    word_count: number
    quick_score: number | null
    quick_feedback: EssayQuickFeedback | null
    deep_score: number | null
    deep_review: EssayDeepReview | null
    time_spent_seconds: number
    created_at: string
    updated_at: string | null
    submitted_at: string | null
}

export type EssayPromptResponse = {
    prompt: string
    suggested_word_count: number
    target_words: string[]
    level: EssayLevel
}

export type EssayCreatePayload = {
    prompt: string
    title?: string
    body?: string
    level?: EssayLevel
    target_word_count?: number
    target_words?: string[]
}

export type EssayUpdatePayload = Partial<{
    title: string | null
    body: string
    level: EssayLevel
    target_word_count: number | null
    target_words: string[]
    time_spent_seconds: number
    status: 'draft' | 'submitted'
}>

const KEYS = {
    list: (status?: string) => ['essays', 'list', status ?? 'all'] as const,
    detail: (id: number) => ['essays', 'detail', id] as const,
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useEssays(status?: string) {
    const { request } = useHttp()
    return useQuery<EssayListItem[]>({
        queryKey: KEYS.list(status),
        queryFn: () => request(API_ENDPOINTS.ESSAYS.LIST(status)),
    })
}

export function useEssay(id?: number) {
    const { request } = useHttp()
    return useQuery<Essay>({
        queryKey: id ? KEYS.detail(id) : ['essays', 'detail', 'none'],
        queryFn: () => request(API_ENDPOINTS.ESSAYS.GET(id as number)),
        enabled: id !== undefined && id > 0,
    })
}

export function useEssayCreate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: EssayCreatePayload) =>
            request(API_ENDPOINTS.ESSAYS.CREATE, { method: 'POST', body: data }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['essays'] }),
    })
}

export function useEssayUpdate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: EssayUpdatePayload }) =>
            request(API_ENDPOINTS.ESSAYS.UPDATE(id), { method: 'PUT', body: data }),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ['essays'] })
            qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) })
        },
    })
}

export function useEssayDelete() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: number) =>
            request(API_ENDPOINTS.ESSAYS.DELETE(id), { method: 'DELETE' }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['essays'] }),
    })
}

export function useEssayPrompt() {
    const { request } = useHttp()
    return useMutation<EssayPromptResponse, Error, {
        level: EssayLevel
        topic_hint?: string
        target_word_count?: number
        use_weak_words?: boolean
    }>({
        mutationFn: (data) =>
            request(API_ENDPOINTS.ESSAYS.PROMPT, { method: 'POST', body: data }),
    })
}

export function useEssayQuickCheck() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation<Essay, Error, number>({
        mutationFn: (id) =>
            request(API_ENDPOINTS.ESSAYS.QUICK_CHECK(id), { method: 'POST', body: {} }),
        onSuccess: (essay) => {
            qc.invalidateQueries({ queryKey: ['essays'] })
            qc.setQueryData(KEYS.detail(essay.id), essay)
        },
    })
}

export function useEssayDeepReview() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation<Essay, Error, number>({
        mutationFn: (id) =>
            request(API_ENDPOINTS.ESSAYS.DEEP_REVIEW(id), { method: 'POST', body: {} }),
        onSuccess: (essay) => {
            qc.invalidateQueries({ queryKey: ['essays'] })
            qc.setQueryData(KEYS.detail(essay.id), essay)
        },
    })
}

// ─── Attempts, errors, stats ─────────────────────────────────────────────────

export type EssayAttempt = {
    id: number
    essay_id: number
    kind: 'quick' | 'deep'
    score: number
    level_estimate: string | null
    word_count: number
    payload: EssayQuickFeedback | EssayDeepReview | null
    created_at: string
}

export type EssayError = {
    id: number
    attempt_id: number
    essay_id: number
    kind: string  // grammar | vocab | style | cohesion | clarity | task_response | upgrade
    original: string | null
    explanation: string | null
    suggestion: string | null
    level: string | null
    created_at: string
}

export type EssayTimelinePoint = {
    id: number
    essay_id: number
    kind: 'quick' | 'deep'
    score: number
    created_at: string
}

export type EssayRecent = {
    id: number
    title: string | null
    prompt: string
    level: EssayLevel
    status: string
    score: number | null
    updated_at: string | null
}

export type EssayStats = {
    days: number
    total_essays: number
    total_attempts: number
    avg_quick: number | null
    avg_deep: number | null
    timeline: EssayTimelinePoint[]
    by_level_avg: Record<string, { avg: number; count: number }>
    error_counts: Record<string, number>
    recent_essays: EssayRecent[]
}

export function useEssayAttempts(essayId?: number) {
    const { request } = useHttp()
    return useQuery<EssayAttempt[]>({
        queryKey: essayId ? ['essays', 'attempts', essayId] : ['essays', 'attempts', 'none'],
        queryFn: () => request(API_ENDPOINTS.ESSAYS.ATTEMPTS(essayId as number)),
        enabled: essayId !== undefined && essayId > 0,
    })
}

export function useEssayErrors(filters: { kind?: string; level?: string; essayId?: number; limit?: number } = {}) {
    const { request } = useHttp()
    return useQuery<EssayError[]>({
        queryKey: ['essays', 'errors', filters],
        queryFn: () => request(API_ENDPOINTS.ESSAYS.ERRORS(filters)),
    })
}

export function useEssayStats(days = 60) {
    const { request } = useHttp()
    return useQuery<EssayStats>({
        queryKey: ['essays', 'stats', days],
        queryFn: () => request(API_ENDPOINTS.ESSAYS.STATS(days)),
    })
}
