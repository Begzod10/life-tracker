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
} = {}) {
    const { count = 10, difficulty, moduleId, folderId } = args
    const { request } = useHttp()
    return useQuery<PracticeWord[]>({
        queryKey: ['practice', 'words', count, difficulty ?? '', moduleId ?? '', folderId ?? ''],
        queryFn: () => request(API_ENDPOINTS.PRACTICE.WORDS(count, difficulty, moduleId, folderId)),
        enabled: false,
        retry: false,
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

export function usePracticeHistory() {
    const { request } = useHttp()
    return useQuery<PracticeSession[]>({
        queryKey: ['practice', 'history'],
        queryFn: () => request(API_ENDPOINTS.PRACTICE.HISTORY(10)),
    })
}
