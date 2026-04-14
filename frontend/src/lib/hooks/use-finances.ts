import { useQuery } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'
import { FinancialSummary } from '@/types'

// Query keys
export const financeKeys = {
    all: ['finances'] as const,
    monthlySummary: (month: string) => [...financeKeys.all, 'monthly-summary', month] as const,
    monthlyReport: (month: string) => [...financeKeys.all, 'monthly-report', month] as const,
    netWorth: () => [...financeKeys.all, 'net-worth'] as const,
    spendingTrends: (months: number) => [...financeKeys.all, 'spending-trends', months] as const,
}

export function useMonthlyFinancialSummary(month: string) {
    const { request } = useHttp()

    return useQuery({
        queryKey: financeKeys.monthlySummary(month),
        queryFn: () => request<FinancialSummary>(API_ENDPOINTS.FINANCIAL_ANALYTICS.MONTHLY_SUMMARY(month)),
        enabled: !!month,
        staleTime: 5 * 60 * 1000,
    })
}

export function useMonthlyReport(month: string) {
    const { request } = useHttp()

    return useQuery({
        queryKey: financeKeys.monthlyReport(month),
        queryFn: () => request(API_ENDPOINTS.FINANCIAL_ANALYTICS.MONTHLY_REPORT(month)),
        enabled: !!month,
        staleTime: 5 * 60 * 1000,
    })
}

export function useNetWorth() {
    const { request } = useHttp()

    return useQuery({
        queryKey: financeKeys.netWorth(),
        queryFn: () => request(API_ENDPOINTS.FINANCIAL_ANALYTICS.NET_WORTH),
        staleTime: 5 * 60 * 1000,
    })
}

export function useSpendingTrends(months = 6) {
    const { request } = useHttp()

    return useQuery({
        queryKey: financeKeys.spendingTrends(months),
        queryFn: () => request(API_ENDPOINTS.FINANCIAL_ANALYTICS.SPENDING_TRENDS(months)),
        staleTime: 5 * 60 * 1000,
    })
}
