import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'

export interface ExpensePayload {
    name: string
    amount: number
    currency: string
    category: string
    subcategory?: string
    payment_type?: string
    date: string
    is_essential: boolean
    is_recurring: boolean
    recurrence_frequency?: string
    person_id: number
    salary_month_id?: number
    saving_id?: number
    source?: string
}

// Query keys
export const expenseKeys = {
    all: ['expenses'] as const,
    list: (personId: string | number) => [...expenseKeys.all, 'list', personId] as const,
    deleted: (personId: string | number) => [...expenseKeys.all, 'deleted', personId] as const,
}

export function useExpenseCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: ExpensePayload) => request(API_ENDPOINTS.EXPENSES.CREATE, {
            method: 'POST',
            body: data
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: expenseKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}

export function useExpensesList(personId: string | number) {
    const { request } = useHttp()
    return useQuery({
        queryKey: expenseKeys.list(personId),
        queryFn: () => request(API_ENDPOINTS.EXPENSES.LIST(personId)),
        enabled: !!personId
    })
}

export function useExpensesBySaving(savingId: string | number) {
    const { request } = useHttp()
    return useQuery({
        queryKey: [...expenseKeys.all, 'by-saving', savingId],
        queryFn: () => request(API_ENDPOINTS.EXPENSES.LIST_BY_SAVING(savingId)),
        enabled: !!savingId
    })
}

export function useDeletedExpensesList(personId: string | number) {
    const { request } = useHttp()
    return useQuery({
        queryKey: expenseKeys.deleted(personId),
        queryFn: () => request(API_ENDPOINTS.EXPENSES.DELETED_LIST(personId)),
        enabled: !!personId
    })
}

export function useExpenseUpdate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: string | number; data: Partial<ExpensePayload> }) =>
            request(API_ENDPOINTS.EXPENSES.UPDATE(id), {
                method: 'PUT',
                body: data
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: expenseKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}

export function useExpenseDelete() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string | number) => request(API_ENDPOINTS.EXPENSES.DELETE(id), {
            method: 'DELETE'
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: expenseKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}
