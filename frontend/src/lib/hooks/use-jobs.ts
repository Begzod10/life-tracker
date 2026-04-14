import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'

export interface JobPayload {
    name: string
    company: string
    salary: number
    currency: string
    employment_type: string
    active: boolean
    start_date: string
    end_date?: string
    notes?: string
    department?: string
    person_id: number
}

// Query keys
export const jobKeys = {
    all: ['jobs'] as const,
    detail: (id: string | number) => [...jobKeys.all, 'detail', id] as const,
    list: (personId: string | number) => [...jobKeys.all, 'list', personId] as const,
    deletedList: (personId: string | number) => [...jobKeys.all, 'deleted', personId] as const,
}

export function useJobCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: JobPayload) => request(API_ENDPOINTS.JOBS.CREATE, {
            method: 'POST',
            body: data
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: jobKeys.all })
            // Ensure we invalidate related financial summaries if creating a job affects them
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}

export function useJob(id: string | number | undefined) {
    const { request } = useHttp()
    return useQuery({
        queryKey: jobKeys.detail(id ?? ''),
        queryFn: () => request(API_ENDPOINTS.JOBS.GET(id!)),
        enabled: !!id,
        staleTime: 1000 * 60 * 5,
    })
}

export function useJobsList(personId?: string | number) {
    const { request } = useHttp()
    return useQuery({
        queryKey: personId ? jobKeys.list(personId) : jobKeys.all,
        queryFn: () => {
            if (!personId) return Promise.resolve([])
            return request(API_ENDPOINTS.JOBS.LIST(personId))
        },
        enabled: !!personId
    })
}

export function useDeletedJobsList(personId?: string | number) {
    const { request } = useHttp()
    return useQuery({
        queryKey: personId ? jobKeys.deletedList(personId) : [...jobKeys.all, 'deleted'],
        queryFn: () => {
            if (!personId) return Promise.resolve([])
            return request(API_ENDPOINTS.JOBS.LIST_DELETED(personId))
        },
        enabled: !!personId
    })
}

export function useJobDelete() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string | number) => request(API_ENDPOINTS.JOBS.DELETE(id), {
            method: 'DELETE'
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: jobKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}

export function useJobUpdate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: string | number; data: Partial<JobPayload> }) =>
            request(API_ENDPOINTS.JOBS.UPDATE(id), {
                method: 'PUT',
                body: data
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: jobKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}
