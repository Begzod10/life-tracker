'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

export type Source = 'smart' | 'due' | 'weak' | 'all'

export type ExerciseType =
    | 'sentence'
    | 'constrained_sentence'
    | 'paraphrase'
    | 'prompt_response'
    | 'meaning_mc'
    | 'reverse_mc'
    | 'cloze'
    | 'spelling'
    | 'anagram'
    | 'match'
    | 'cloze_bank'
    | 'word_formation'
    | 'synonym_antonym'
    | 'odd_one_out'

export type ExerciseMode =
    | 'auto'
    | 'recognition'
    | 'cloze'
    | 'production'
    | 'mixed'
    | ExerciseType

export type ExerciseItem = {
    word_id: number
    exercise_type: ExerciseType
    group_id: string | null
    prompt: string
    // Optional per type
    options?: string[]             // meaning_mc, reverse_mc, synonym_antonym, odd_one_out
    hint?: string                  // anagram
    instruction?: string           // definition for production + word_formation
    constraint?: string            // constrained_sentence
    source_sentence?: string       // paraphrase
    form_type?: string             // word_formation: which morphological form is asked
    relation_type?: string         // synonym_antonym: 'synonym' | 'antonym'
    // Group data (match + cloze_bank — present on every item in the group)
    question_payload?: {
        words?: string[]
        definitions?: string[]
        word_bank?: string[]
    } | null
    // Word info (present for production + MC types)
    word?: string
    definition?: string
    translation?: string | null
    phonetic?: string | null
    part_of_speech?: string | null
    difficulty?: string
    examples?: string[]
}

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
    exercise_type: ExerciseType
    response: string
    is_correct: boolean
    usage_score: number | null
    feedback: string | null
    suggested_revision: string | null
    correct_answer: string | null
    grammar_errors: string[] | null
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
    exercise_type: ExerciseType
    response: string
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

export type GrammarWeakArea = {
    type: string
    label: string
    count: number
}

export type AccuracyTrendPoint = {
    date: string
    attempts: number
    correct: number
    accuracy: number
}

export type ExerciseTypeStats = {
    type: ExerciseType
    attempts: number
    correct: number
    accuracy: number
}

export type ExerciseAnalytics = {
    period_days: number
    total_attempts: number
    total_correct: number
    overall_accuracy: number
    avg_usage_score: number | null
    accuracy_trend: AccuracyTrendPoint[]
    grammar_weak_areas: GrammarWeakArea[]
    exercise_type_stats: ExerciseTypeStats[]
}

export type StartExerciseRequest = {
    source?: Source
    count?: number
    mode?: ExerciseMode
    folder_id?: number
    module_id?: number
}

export type StartExerciseResponse = {
    session_id: number
    started_at: string
    items: ExerciseItem[]
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
    return useMutation<StartExerciseResponse, Error, StartExerciseRequest>({
        mutationFn: (body) =>
            request(API_ENDPOINTS.EXERCISES.START, {
                method: 'POST',
                body,
            }),
    })
}

export function useGradeExercises() {
    const { request } = useHttp()
    return useMutation<
        ExerciseGradeResponse,
        Error,
        { sessionId?: number; items: { word_id: number; response: string }[] }
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

export function useExerciseAnalytics(days = 30) {
    const { request } = useHttp()
    return useQuery<ExerciseAnalytics>({
        queryKey: ['exercises', 'analytics', days],
        queryFn: () => request(API_ENDPOINTS.EXERCISES.ANALYTICS(days)),
        staleTime: 5 * 60 * 1000,
    })
}
