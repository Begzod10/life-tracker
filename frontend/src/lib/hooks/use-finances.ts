import { useQuery } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'
import { FinancialSummary } from '@/types'

// Query keys
export const financeKeys = {
    all: ['finances'] as const,
    monthlySummary: (month: string) => [...financeKeys.all, 'monthly-summary', month] as const,
}

export function useMonthlyFinancialSummary(month: string) {
    const { request } = useHttp()

    return useQuery({
        queryKey: financeKeys.monthlySummary(month),
        queryFn: () => request<FinancialSummary>(API_ENDPOINTS.FINANCIAL_ANALYTICS.MONTHLY_SUMMARY(month)),
        enabled: !!month,
    })
}
