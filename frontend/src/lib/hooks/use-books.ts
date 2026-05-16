'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

export type BookStatus = 'want' | 'reading' | 'done'

export interface Book {
    id: number
    title: string
    author: string | null
    total_pages: number
    current_page: number
    status: BookStatus
    cover_url: string | null
    isbn: string | null
    tags: string | null
    notes: string | null
    file_size_bytes: number | null
    last_opened_at: string | null
    finished_at: string | null
    created_at: string
    updated_at: string | null
    progress_percent: number
    highlight_count: number
    resume_text: string | null
    resume_page: number | null
}

export interface BookListResponse {
    items: Book[]
    total: number
    by_status: Record<string, number>
}

export interface BookHighlight {
    id: number
    book_id: number
    page: number
    text: string
    note: string | null
    kind: 'highlight' | 'vocab' | 'note'
    color: string | null
    dictionary_word_id: number | null
    translation: string | null
    definition: string | null
    created_at: string
}

export interface ReadingSession {
    id: number
    book_id: number
    started_at: string
    ended_at: string | null
    start_page: number
    end_page: number
    pages_read: number
    minutes: number | null
}

export interface LibraryStats {
    total_books: number
    by_status: Record<BookStatus, number>
    pages_read_total: number
    pages_last_30d: number
}

export interface BookUploadInput {
    file: File
    title?: string
    author?: string
    status?: BookStatus
    cover_url?: string
    tags?: string
}

export interface BookUpdateInput {
    title?: string
    author?: string
    status?: BookStatus
    cover_url?: string
    tags?: string
    notes?: string
    current_page?: number
    // Pass null to clear the resume pointer.
    resume_text?: string | null
    resume_page?: number | null
}

export interface HighlightCreateInput {
    page: number
    text: string
    note?: string
    kind?: 'highlight' | 'vocab' | 'note'
    color?: string
    save_to_dictionary?: boolean
    module_id?: number
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useBooks(status?: BookStatus) {
    const { request } = useHttp()
    return useQuery<BookListResponse>({
        queryKey: ['books', status ?? 'all'],
        queryFn: () => request<BookListResponse>(API_ENDPOINTS.BOOKS.LIST(status)),
    })
}

export function useBook(id?: number) {
    const { request } = useHttp()
    return useQuery<Book>({
        queryKey: ['book', id],
        queryFn: () => request<Book>(API_ENDPOINTS.BOOKS.GET(id as number)),
        enabled: !!id,
    })
}

export function useLibraryStats() {
    const { request } = useHttp()
    return useQuery<LibraryStats>({
        queryKey: ['books', 'stats'],
        queryFn: () => request<LibraryStats>(API_ENDPOINTS.BOOKS.STATS),
    })
}

export function useBookHighlights(bookId?: number) {
    const { request } = useHttp()
    return useQuery<BookHighlight[]>({
        queryKey: ['book-highlights', bookId],
        queryFn: () => request<BookHighlight[]>(API_ENDPOINTS.BOOKS.HIGHLIGHTS(bookId as number)),
        enabled: !!bookId,
    })
}

export function useBookSessions(bookId?: number) {
    const { request } = useHttp()
    return useQuery<ReadingSession[]>({
        queryKey: ['book-sessions', bookId],
        queryFn: () => request<ReadingSession[]>(API_ENDPOINTS.BOOKS.SESSIONS(bookId as number)),
        enabled: !!bookId,
    })
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useBookUpload() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: BookUploadInput) => {
            const fd = new FormData()
            fd.append('file', input.file)
            if (input.title) fd.append('title', input.title)
            if (input.author) fd.append('author', input.author)
            if (input.status) fd.append('status', input.status)
            if (input.cover_url) fd.append('cover_url', input.cover_url)
            if (input.tags) fd.append('tags', input.tags)
            return request<Book>(API_ENDPOINTS.BOOKS.CREATE, { method: 'POST', body: fd })
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['books'] })
        },
    })
}

export function useBookUpdate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: BookUpdateInput }) =>
            request<Book>(API_ENDPOINTS.BOOKS.UPDATE(id), { method: 'PATCH', body: data }),
        onSuccess: (book) => {
            qc.invalidateQueries({ queryKey: ['books'] })
            qc.setQueryData(['book', book.id], book)
        },
    })
}

export function useBookDelete() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, hard = false }: { id: number; hard?: boolean }) =>
            request<void>(API_ENDPOINTS.BOOKS.DELETE(id, hard), { method: 'DELETE' }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['books'] })
        },
    })
}

export function useHighlightCreate() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ bookId, data }: { bookId: number; data: HighlightCreateInput }) =>
            request<BookHighlight>(API_ENDPOINTS.BOOKS.HIGHLIGHTS(bookId), { method: 'POST', body: data }),
        onSuccess: (_h, { bookId }) => {
            qc.invalidateQueries({ queryKey: ['book-highlights', bookId] })
            qc.invalidateQueries({ queryKey: ['book', bookId] })
            qc.invalidateQueries({ queryKey: ['books'] })
            qc.invalidateQueries({ queryKey: ['dictionary'] })
        },
    })
}

export function useHighlightDelete() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ bookId, highlightId }: { bookId: number; highlightId: number }) =>
            request<void>(API_ENDPOINTS.BOOKS.HIGHLIGHT(bookId, highlightId), { method: 'DELETE' }),
        onSuccess: (_v, { bookId }) => {
            qc.invalidateQueries({ queryKey: ['book-highlights', bookId] })
            qc.invalidateQueries({ queryKey: ['book', bookId] })
        },
    })
}
