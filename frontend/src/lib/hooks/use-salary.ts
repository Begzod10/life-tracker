import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'
import { jobKeys } from './use-jobs'

export interface SalaryMonthPayload {
    job_id: number
    month: string // "YYYY-MM"
    salary_amount: number
    deductions: number
    net_amount: number
    received_date: string // "YYYY-MM-DD"
    person_id: number
}

// Query keys
export const salaryKeys = {
    all: ['salary-months'] as const,
    detail: (id: string | number) => [...salaryKeys.all, 'detail', id] as const,
    list: (personId: string | number) => [...salaryKeys.all, 'list', personId] as const,
    deleted: (personId: string | number) => [...salaryKeys.all, 'deleted', personId] as const,
}

export function useSalaryMonth(id: string | number) {
    const { request } = useHttp()

    return useQuery({
        queryKey: salaryKeys.detail(id),
        queryFn: () => request(API_ENDPOINTS.SALARY_MONTHS.GET(id)),
        enabled: !!id,
        staleTime: 1000 * 60 * 5,
    })
}

export function useSalaryMonthsList(personId: string | number) {
    const { request } = useHttp()

    return useQuery({
        queryKey: salaryKeys.list(personId),
        queryFn: () => request(API_ENDPOINTS.SALARY_MONTHS.LIST(personId)),
        enabled: !!personId,
        staleTime: 1000 * 60 * 5, // 5 minutes
    })
}

export function useDeletedSalaryMonthsList(personId: string | number) {
    const { request } = useHttp()

    return useQuery({
        queryKey: salaryKeys.deleted(personId),
        queryFn: () => request(API_ENDPOINTS.SALARY_MONTHS.DELETED_LIST(personId)),
        enabled: !!personId,
        staleTime: 1000 * 60 * 5, // 5 minutes
    })
}

export function useSalaryMonthCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: SalaryMonthPayload) => request(API_ENDPOINTS.SALARY_MONTHS.CREATE, {
            method: 'POST',
            body: data
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: salaryKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
            queryClient.invalidateQueries({ queryKey: jobKeys.all })
        }
    })
}

export function useSalaryMonthUpdate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: string | number; data: Partial<SalaryMonthPayload> }) =>
            request(API_ENDPOINTS.SALARY_MONTHS.UPDATE(id), {
                method: 'PUT',
                body: data
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: salaryKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}

export function useSalaryMonthDelete() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string | number) => request(API_ENDPOINTS.SALARY_MONTHS.DELETE(id), {
            method: 'DELETE'
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: salaryKeys.all })
            queryClient.invalidateQueries({ queryKey: ['finances'] })
        }
    })
}
