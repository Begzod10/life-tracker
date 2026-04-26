'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

export type DictionaryWord = {
    id: number
    person_id: number
    word: string
    definition: string
    translation?: string
    part_of_speech?: string
    examples?: string[]
    phonetic?: string
    difficulty: string
    tags?: string
    review_count: number
    correct_count: number
    last_reviewed_at?: string
    created_at: string
}

export type WordCreate = {
    word: string
    definition: string
    translation?: string
    part_of_speech?: string
    examples?: string[]
    phonetic?: string
    difficulty?: string
    tags?: string
}

export type DictStats = {
    total: number
    reviewed: number
    accuracy: number
    by_difficulty: Record<string, number>
    by_part_of_speech: Record<string, number>
}

const KEYS = {
    words: ['dictionary', 'words'] as const,
    stats: ['dictionary', 'stats'] as const,
}

export function useDictionaryWords(search?: string, difficulty?: string) {
    const { request } = useHttp()
    return useQuery<DictionaryWord[]>({
        queryKey: [...KEYS.words, search ?? '', difficulty ?? ''],
        queryFn: () => {
            const url = new URL(API_ENDPOINTS.DICTIONARY.LIST, window.location.origin)
            if (search) url.searchParams.set('search', search)
            if (difficulty) url.searchParams.set('difficulty', difficulty)
            return request(url.pathname + url.search)
        },
    })
}

export function useDictStats() {
    const { request } = useHttp()
    return useQuery<DictStats>({
        queryKey: KEYS.stats,
        queryFn: () => request(API_ENDPOINTS.DICTIONARY.STATS),
    })
}

export function useWordCreate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: WordCreate) =>
            request(API_ENDPOINTS.DICTIONARY.CREATE, { method: 'POST', body: JSON.stringify(data) }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.words })
            qc.invalidateQueries({ queryKey: KEYS.stats })
        },
    })
}

export function useWordUpdate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<WordCreate> }) =>
            request(API_ENDPOINTS.DICTIONARY.UPDATE(id), { method: 'PUT', body: JSON.stringify(data) }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.words })
            qc.invalidateQueries({ queryKey: KEYS.stats })
        },
    })
}

export function useWordDelete() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: number) =>
            request(API_ENDPOINTS.DICTIONARY.DELETE(id), { method: 'DELETE' }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.words })
            qc.invalidateQueries({ queryKey: KEYS.stats })
        },
    })
}
