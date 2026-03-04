import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'

export interface IncomeSourcePayload {
    amount: number
    currency: string
    description: string
    frequency: string
    person_id: number
    received_date: string
    source_name: string
    source_type: string
}

export const incomeSourceKeys = {
    all: ['income-sources'] as const,
    list: (personId: string | number) => [...incomeSourceKeys.all, 'list', String(personId)] as const,
    deletedList: (personId: string | number) => [...incomeSourceKeys.all, 'deleted-list', String(personId)] as const,
}

export function useIncomeSourceCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: IncomeSourcePayload) => request(API_ENDPOINTS.INCOME_SOURCES.CREATE, {
            method: 'POST',
            body: data
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: incomeSourceKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}

export function useIncomeSourcesList(personId: string | number) {
    const { request } = useHttp()

    return useQuery({
        queryKey: incomeSourceKeys.list(personId),
        queryFn: () => request(API_ENDPOINTS.INCOME_SOURCES.LIST(personId)),
        staleTime: 5 * 60 * 1000,
    })
}

export function useDeletedIncomeSourcesList(personId: string | number) {
    const { request } = useHttp()

    return useQuery({
        queryKey: incomeSourceKeys.deletedList(personId),
        queryFn: () => request(API_ENDPOINTS.INCOME_SOURCES.DELETED_LIST(personId)),
        staleTime: 5 * 60 * 1000,
    })
}

export function useIncomeSourceUpdate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: string | number, data: Partial<IncomeSourcePayload> }) =>
            request(API_ENDPOINTS.INCOME_SOURCES.UPDATE(id), {
                method: 'PUT',
                body: data
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: incomeSourceKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}

export function useIncomeSourceDelete() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string | number) => request(API_ENDPOINTS.INCOME_SOURCES.DELETE(id), {
            method: 'DELETE'
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: incomeSourceKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}
