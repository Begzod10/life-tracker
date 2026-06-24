import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ErrorHuntNext {
  grammar_point_id: string
  grammar_point_name: string
  rule: string
  errored_sentence: string
  correct_sentence: string
}

export interface ErrorHuntGradeResult {
  is_correct: boolean
  correct_sentence: string
  grammar_point_id: string
  grammar_point_name: string
  rule: string
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useErrorHuntNext() {
  const { request } = useHttp()

  return useQuery<ErrorHuntNext>({
    queryKey: ['error-hunt-next'],
    queryFn: () => request(API_ENDPOINTS.ERROR_HUNT.NEXT) as Promise<ErrorHuntNext>,
    staleTime: 0,
  })
}

export function useErrorHuntGrade() {
  const { request } = useHttp()
  const qc = useQueryClient()

  return useMutation<
    ErrorHuntGradeResult,
    Error,
    { grammar_point_id: string; response: string }
  >({
    mutationFn: (body) =>
      request(API_ENDPOINTS.ERROR_HUNT.GRADE, {
        method: 'POST',
        body,
      }) as Promise<ErrorHuntGradeResult>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['error-hunt-next'] })
      qc.invalidateQueries({ queryKey: ['grammar-points'] })
      qc.invalidateQueries({ queryKey: ['grammar-drill-queue'] })
    },
  })
}
