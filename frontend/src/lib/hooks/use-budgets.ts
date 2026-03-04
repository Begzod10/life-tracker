import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'

export interface BudgetPayload {
    allocated_amount: number
    category: string
    notes?: string
    period: string
    period_type: string
    person_id: number
}

// Query keys
export const budgetKeys = {
    all: ['budgets'] as const,
    list: (personId: string | number) => [...budgetKeys.all, 'list', String(personId)] as const,
    deletedList: (personId: string | number) => [...budgetKeys.all, 'deleted-list', String(personId)] as const,
}

export function useBudgetCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: BudgetPayload) => request(API_ENDPOINTS.BUDGETS.CREATE, {
            method: 'POST',
            body: data
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: budgetKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}

export function useBudgetsList(personId: string | number) {
    const { request } = useHttp()

    return useQuery({
        queryKey: budgetKeys.list(personId),
        queryFn: () => request(API_ENDPOINTS.BUDGETS.LIST(personId)),
        staleTime: 5 * 60 * 1000, // 5 minutes
    })
}

export function useDeletedBudgetsList(personId: string | number) {
    const { request } = useHttp()

    return useQuery({
        queryKey: budgetKeys.deletedList(personId),
        queryFn: () => request(API_ENDPOINTS.BUDGETS.DELETED_LIST(personId)),
        staleTime: 5 * 60 * 1000,
    })
}

export function useBudgetUpdate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: string | number; data: Partial<BudgetPayload> }) =>
            request(API_ENDPOINTS.BUDGETS.UPDATE(id), {
                method: 'PUT',
                body: data
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: budgetKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}

export function useBudgetDelete() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string | number) => request(API_ENDPOINTS.BUDGETS.DELETE(id), {
            method: 'DELETE'
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: budgetKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}
