'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

// ─── Types ───────────────────────────────────────────────────────────────────

export type DictionaryFolder = {
    id: number
    person_id: number
    name: string
    color?: string | null
    module_count: number
    word_count: number
    created_at: string
}

export type FolderCreate = {
    name: string
    color?: string
}

export type DictionaryModule = {
    id: number
    folder_id: number
    person_id: number
    name: string
    description?: string | null
    word_count: number
    created_at: string
}

export type ModuleCreate = {
    folder_id: number
    name: string
    description?: string
}

export type DictionaryWord = {
    id: number
    person_id: number
    module_id?: number | null
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
    module_id: number
    word: string
    definition: string
    translation?: string
    part_of_speech?: string
    examples?: string[]
    phonetic?: string
    difficulty?: string
    tags?: string
}

export type ReviewCandidate = {
    id: number
    module_id: number | null
    word: string
    difficulty: string
    review_count: number
    accuracy: number | null
}

export type DictStats = {
    total: number
    reviewed: number
    accuracy: number
    by_difficulty: Record<string, number>
    by_part_of_speech: Record<string, number>
    needs_review_total: number
    needs_review: ReviewCandidate[]
}

const KEYS = {
    folders: ['dictionary', 'folders'] as const,
    modules: ['dictionary', 'modules'] as const,
    words: ['dictionary', 'words'] as const,
    stats: ['dictionary', 'stats'] as const,
}

// ─── Folders ────────────────────────────────────────────────────────────────

export function useFolders() {
    const { request } = useHttp()
    return useQuery<DictionaryFolder[]>({
        queryKey: KEYS.folders,
        queryFn: () => request(API_ENDPOINTS.DICTIONARY.FOLDERS),
    })
}

export function useFolderCreate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: FolderCreate) =>
            request(API_ENDPOINTS.DICTIONARY.FOLDERS, { method: 'POST', body: data }),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.folders }),
    })
}

export function useFolderUpdate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<FolderCreate> }) =>
            request(API_ENDPOINTS.DICTIONARY.FOLDER(id), { method: 'PUT', body: data }),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.folders }),
    })
}

export function useFolderDelete() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: number) =>
            request(API_ENDPOINTS.DICTIONARY.FOLDER(id), { method: 'DELETE' }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.folders })
            qc.invalidateQueries({ queryKey: KEYS.modules })
            qc.invalidateQueries({ queryKey: KEYS.words })
        },
    })
}

// ─── Modules ─────────────────────────────────────────────────────────────────

export function useModules(folderId?: number) {
    const { request } = useHttp()
    return useQuery<DictionaryModule[]>({
        queryKey: [...KEYS.modules, folderId ?? 'all'],
        queryFn: () => {
            const url = folderId
                ? `${API_ENDPOINTS.DICTIONARY.MODULES}?folder_id=${folderId}`
                : API_ENDPOINTS.DICTIONARY.MODULES
            return request(url)
        },
        enabled: folderId !== undefined,
    })
}

export function useModuleCreate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: ModuleCreate) =>
            request(API_ENDPOINTS.DICTIONARY.MODULES, { method: 'POST', body: data }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.modules })
            qc.invalidateQueries({ queryKey: KEYS.folders })
        },
    })
}

export function useModuleUpdate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<ModuleCreate> }) =>
            request(API_ENDPOINTS.DICTIONARY.MODULE(id), { method: 'PUT', body: data }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.modules })
            qc.invalidateQueries({ queryKey: KEYS.folders })
        },
    })
}

export function useModuleDelete() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: number) =>
            request(API_ENDPOINTS.DICTIONARY.MODULE(id), { method: 'DELETE' }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.modules })
            qc.invalidateQueries({ queryKey: KEYS.folders })
            qc.invalidateQueries({ queryKey: KEYS.words })
        },
    })
}

// ─── Words ───────────────────────────────────────────────────────────────────

export function useDictionaryWords(args: {
    moduleId?: number
    folderId?: number
    search?: string
    difficulty?: string
} = {}) {
    const { moduleId, folderId, search, difficulty } = args
    const { request } = useHttp()
    return useQuery<DictionaryWord[]>({
        queryKey: [...KEYS.words, moduleId ?? '', folderId ?? '', search ?? '', difficulty ?? ''],
        queryFn: () => {
            const params = new URLSearchParams()
            if (moduleId !== undefined) params.set('module_id', String(moduleId))
            if (folderId !== undefined) params.set('folder_id', String(folderId))
            if (search) params.set('search', search)
            if (difficulty) params.set('difficulty', difficulty)
            const qs = params.toString()
            return request(qs ? `${API_ENDPOINTS.DICTIONARY.LIST}?${qs}` : API_ENDPOINTS.DICTIONARY.LIST)
        },
        enabled: moduleId !== undefined || folderId !== undefined,
    })
}

export function useDictStats(args: { folderId?: number; moduleId?: number } = {}) {
    const { folderId, moduleId } = args
    const { request } = useHttp()
    return useQuery<DictStats>({
        queryKey: [...KEYS.stats, folderId ?? '', moduleId ?? ''],
        queryFn: () => request(API_ENDPOINTS.DICTIONARY.STATS({ folderId, moduleId })),
    })
}

export type AiWordDetails = {
    word: string
    definition: string
    translation: string
    phonetic: string
    part_of_speech: string
    difficulty: string
    examples: string[]
}

export function useAiWordDetails() {
    const { request } = useHttp()
    return useMutation<AiWordDetails, Error, string>({
        mutationFn: (word: string) =>
            request(API_ENDPOINTS.DICTIONARY.AI_WORD_DETAILS, {
                method: 'POST',
                body: { word },
            }),
    })
}

export type AiGenerateModulePayload = {
    folder_id: number
    topic: string
    level: string
    count: number
    module_name?: string
}

export function useAiGenerateModule() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation<DictionaryModule, Error, AiGenerateModulePayload>({
        mutationFn: (data) =>
            request(API_ENDPOINTS.DICTIONARY.AI_GENERATE_MODULE, { method: 'POST', body: data }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.modules })
            qc.invalidateQueries({ queryKey: KEYS.folders })
            qc.invalidateQueries({ queryKey: KEYS.words })
            qc.invalidateQueries({ queryKey: KEYS.stats })
        },
    })
}

export type AiExtractCandidate = AiWordDetails

export function useAiExtractVocab() {
    const { request } = useHttp()
    return useMutation<{ candidates: AiExtractCandidate[] }, Error, { text: string; level: string; max_words: number }>({
        mutationFn: (data) =>
            request(API_ENDPOINTS.DICTIONARY.AI_EXTRACT_VOCAB, { method: 'POST', body: data }),
    })
}

export function useWordCreate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: WordCreate) =>
            request(API_ENDPOINTS.DICTIONARY.CREATE, { method: 'POST', body: data }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.words })
            qc.invalidateQueries({ queryKey: KEYS.stats })
            qc.invalidateQueries({ queryKey: KEYS.modules })
            qc.invalidateQueries({ queryKey: KEYS.folders })
        },
    })
}

export function useWordUpdate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<WordCreate> }) =>
            request(API_ENDPOINTS.DICTIONARY.UPDATE(id), { method: 'PUT', body: data }),
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
            qc.invalidateQueries({ queryKey: KEYS.modules })
            qc.invalidateQueries({ queryKey: KEYS.folders })
        },
    })
}
