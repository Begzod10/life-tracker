import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'
import { salaryKeys } from './use-salary'
import { budgetKeys } from './use-budgets'
import { savingKeys } from './use-savings'

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
            queryClient.invalidateQueries({ queryKey: salaryKeys.all })
            queryClient.invalidateQueries({ queryKey: budgetKeys.all })
            queryClient.invalidateQueries({ queryKey: savingKeys.all })
        }
    })
}

export function useExpensesList(personId: string | number) {
    const { request } = useHttp()
    return useQuery({
        queryKey: expenseKeys.list(personId),
        queryFn: () => request(API_ENDPOINTS.EXPENSES.LIST(personId)),
        enabled: !!personId,
        staleTime: 5 * 60 * 1000,
    })
}

export function useExpensesBySaving(savingId: string | number) {
    const { request } = useHttp()
    return useQuery({
        queryKey: [...expenseKeys.all, 'by-saving', savingId],
        queryFn: () => request(API_ENDPOINTS.EXPENSES.LIST_BY_SAVING(savingId)),
        enabled: !!savingId,
        staleTime: 5 * 60 * 1000,
    })
}

export function useExpensesBySalaryMonth(salaryMonthId: string | number) {
    const { request } = useHttp()
    return useQuery({
        queryKey: [...expenseKeys.all, 'by-salary-month', salaryMonthId],
        queryFn: () => request(API_ENDPOINTS.SALARY_MONTHS.EXPENSES(salaryMonthId)),
        enabled: !!salaryMonthId,
        staleTime: 5 * 60 * 1000,
    })
}

export function useDeletedExpensesList(personId: string | number) {
    const { request } = useHttp()
    return useQuery({
        queryKey: expenseKeys.deleted(personId),
        queryFn: () => request(API_ENDPOINTS.EXPENSES.DELETED_LIST(personId)),
        enabled: !!personId,
        staleTime: 5 * 60 * 1000,
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
            queryClient.invalidateQueries({ queryKey: salaryKeys.all })
            queryClient.invalidateQueries({ queryKey: budgetKeys.all })
            queryClient.invalidateQueries({ queryKey: savingKeys.all })
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
            queryClient.invalidateQueries({ queryKey: salaryKeys.all })
            queryClient.invalidateQueries({ queryKey: budgetKeys.all })
            queryClient.invalidateQueries({ queryKey: savingKeys.all })
        }
    })
}
