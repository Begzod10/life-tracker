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

export interface GennisSalaryPayment {
    id: number
    salary_month_id: number
    gennis_payment_id: number
    gennis_salary_location_id: number
    amount: number
    reason: string | null
    payment_date: string | null  // "YYYY-MM-DD"
    payment_type_id: number | null
    payment_type: string | null  // cash | click | bank
    created_at: string
}

// Query keys
export const salaryKeys = {
    all: ['salary-months'] as const,
    detail: (id: string | number) => [...salaryKeys.all, 'detail', id] as const,
    list: (personId: string | number) => [...salaryKeys.all, 'list', personId] as const,
    deleted: (personId: string | number) => [...salaryKeys.all, 'deleted', personId] as const,
    gennisPayments: (id: string | number) => [...salaryKeys.all, 'gennis-payments', id] as const,
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

export function useGennisPayments(salaryMonthId: string | number | null | undefined) {
    const { request } = useHttp()

    return useQuery<GennisSalaryPayment[]>({
        queryKey: salaryKeys.gennisPayments(salaryMonthId ?? ''),
        queryFn: () => request(API_ENDPOINTS.SALARY_MONTHS.GENNIS_PAYMENTS(salaryMonthId as string | number)),
        enabled: !!salaryMonthId,
        staleTime: 1000 * 60 * 5,
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
