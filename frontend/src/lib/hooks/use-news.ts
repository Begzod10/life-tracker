import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'

export interface NewsCategory {
    id: number
    slug: string
    label: string
    color?: string | null
    sort_order: number
    mode: 'native' | 'search'
    is_selected: boolean
}

export interface NewsItem {
    id: number
    category_id: number
    category_slug: string
    category_label: string
    category_color?: string | null
    date: string                // YYYY-MM-DD
    headline: string
    summary?: string | null
    url: string
    image_url?: string | null
    source_name?: string | null
    provider: 'gnews' | 'newsapi'
    published_at?: string | null
}

export interface NewsDates {
    dates: string[]
}

export interface NewsFetchSummary {
    date: string
    total_inserted: number
    categories: {
        slug: string
        fetched: number
        inserted: number
        skipped_dup: number
        provider: string | null
        error: string | null
    }[]
}

const keys = {
    all: ['news'] as const,
    categories: ['news', 'categories'] as const,
    items: (date?: string) => ['news', 'items', date ?? 'today'] as const,
    dates: (from?: string, to?: string) =>
        ['news', 'dates', from ?? '', to ?? ''] as const,
}

export function useNewsCategories() {
    const { request } = useHttp()
    return useQuery<NewsCategory[]>({
        queryKey: keys.categories,
        queryFn: () => request(API_ENDPOINTS.NEWS.CATEGORIES),
    })
}

export function useSetNewsCategories() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation<NewsCategory[], Error, number[]>({
        mutationFn: (categoryIds: number[]) =>
            request(API_ENDPOINTS.NEWS.CATEGORIES, {
                method: 'PUT',
                // useHttp.buildConfig calls JSON.stringify(body) internally —
                // pass the plain object so we don't double-encode.
                body: { category_ids: categoryIds },
            }),
        onSuccess: (data) => {
            qc.setQueryData(keys.categories, data)
            // Items + dates depend on the user's selection; invalidate.
            qc.invalidateQueries({ queryKey: ['news', 'items'] })
            qc.invalidateQueries({ queryKey: ['news', 'dates'] })
        },
    })
}

export function useNewsItems(date?: string) {
    const { request } = useHttp()
    return useQuery<NewsItem[]>({
        queryKey: keys.items(date),
        queryFn: () => request(API_ENDPOINTS.NEWS.ITEMS(date)),
    })
}

export function useNewsDates(from?: string, to?: string) {
    const { request } = useHttp()
    return useQuery<NewsDates>({
        queryKey: keys.dates(from, to),
        queryFn: () => request(API_ENDPOINTS.NEWS.DATES(from, to)),
    })
}

export function useNewsFetch() {
    const { request } = useHttp()
    const qc = useQueryClient()
    return useMutation<NewsFetchSummary, Error, string | undefined>({
        mutationFn: (date?: string) =>
            request(API_ENDPOINTS.NEWS.FETCH(date), { method: 'POST' }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['news', 'items'] })
            qc.invalidateQueries({ queryKey: ['news', 'dates'] })
        },
    })
}
