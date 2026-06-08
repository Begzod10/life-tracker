'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

export type Source = 'smart' | 'due' | 'weak' | 'all'

export type ExerciseWord = {
    id: number
    word: string
    definition: string
    translation?: string | null
    part_of_speech?: string | null
    phonetic?: string | null
    examples: string[]
    difficulty: string
}

export type ExerciseGradeResult = {
    word_id: number
    word: string
    sentence: string
    is_correct: boolean
    usage_score: number | null
    feedback: string | null
    suggested_revision: string | null
    next_review_at: string
}

export type ExerciseGradeResponse = {
    session_id: number | null
    total: number
    correct: number
    accuracy: number
    results: ExerciseGradeResult[]
}

export type ExerciseAttempt = {
    id: number
    session_id: number | null
    word_id: number
    word: string | null
    sentence: string
    is_correct: boolean
    usage_score: number | null
    feedback: string | null
    suggested_revision: string | null
    created_at: string | null
}

export type ExerciseStats = {
    total: number
    correct: number
    accuracy: number
    last_7d_total: number
    last_7d_correct: number
}

/** Single source of truth for the 0–100 scale. */
export function formatUsageScore(score: number | null): string {
    if (score == null) return '—'
    return `${score}/100`
}

export function useExerciseWords(args: {
    count?: number
    difficulty?: string
    moduleId?: number
    folderId?: number
    source?: Source
} = {}) {
    const { request } = useHttp()
    return useQuery<ExerciseWord[]>({
        queryKey: [
            'exercises', 'words',
            args.count ?? 5,
            args.difficulty ?? '',
            args.moduleId ?? '',
            args.folderId ?? '',
            args.source ?? 'smart',
        ],
        queryFn: () => request(API_ENDPOINTS.EXERCISES.WORDS(args)),
        enabled: false,
        retry: false,
    })
}

export function useStartExerciseSession() {
    const { request } = useHttp()
    return useMutation<{ id: number; started_at: string }>({
        mutationFn: () => request(API_ENDPOINTS.EXERCISES.START, { method: 'POST' }),
    })
}

export function useGradeExercises() {
    const { request } = useHttp()
    return useMutation<
        ExerciseGradeResponse,
        Error,
        { sessionId?: number; items: { word_id: number; sentence: string }[] }
    >({
        mutationFn: ({ sessionId, items }) =>
            request(API_ENDPOINTS.EXERCISES.GRADE, {
                method: 'POST',
                body: { session_id: sessionId, items },
            }),
    })
}

export function useExerciseHistory(limit = 20, wordId?: number) {
    const { request } = useHttp()
    return useQuery<ExerciseAttempt[]>({
        queryKey: ['exercises', 'history', limit, wordId ?? ''],
        queryFn: () => request(API_ENDPOINTS.EXERCISES.HISTORY(limit, wordId)),
    })
}

export function useExerciseStats() {
    const { request } = useHttp()
    return useQuery<ExerciseStats>({
        queryKey: ['exercises', 'stats'],
        queryFn: () => request(API_ENDPOINTS.EXERCISES.STATS),
    })
}
