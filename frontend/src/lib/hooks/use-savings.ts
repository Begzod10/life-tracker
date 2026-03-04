import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'

export interface SavingsPayload {
    account_name: string
    account_type: string
    currency: string
    current_balance?: number
    initial_amount: number
    interest_rate: number
    person_id?: number
    platform: string
    risk_level: string
    start_date: string
    target_amount: number
    maturity_date?: string
    notes?: string
}

export const savingKeys = {
    all: ['savings'] as const,
    list: (personId: string | number) => [...savingKeys.all, 'list', String(personId)] as const,
    deletedList: (personId: string | number) => [...savingKeys.all, 'deleted-list', String(personId)] as const,
}

export function useSavingsCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: SavingsPayload) => request(API_ENDPOINTS.SAVINGS.CREATE, {
            method: 'POST',
            body: data
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: savingKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}

export function useSavingsList(personId: string | number) {
    const { request } = useHttp()

    return useQuery({
        queryKey: savingKeys.list(personId),
        queryFn: () => request(API_ENDPOINTS.SAVINGS.LIST(personId)),
        staleTime: 5 * 60 * 1000,
    })
}

export function useDeletedSavingsList(personId: string | number) {
    const { request } = useHttp()

    return useQuery({
        queryKey: savingKeys.deletedList(personId),
        queryFn: () => request(API_ENDPOINTS.SAVINGS.DELETED_LIST(personId)),
        staleTime: 5 * 60 * 1000,
    })
}

export function useSavingsUpdate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: string | number, data: Partial<SavingsPayload> }) =>
            request(API_ENDPOINTS.SAVINGS.UPDATE(id), {
                method: 'PUT',
                body: data
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: savingKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}

export function useSavingsDelete() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string | number) => request(API_ENDPOINTS.SAVINGS.DELETE(id), {
            method: 'DELETE'
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: savingKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}
