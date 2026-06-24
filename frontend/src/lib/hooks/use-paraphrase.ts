import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParaphraseNext {
  technique_key: string
  technique_name: string
  technique_short: string
  technique_description: string
  technique_instruction: string
  example_original: string
  example_paraphrase: string
  sentence_id: number
  original_sentence: string
  topic: string
}

export interface ParaphraseGradeResult {
  id: number
  applied_correctly: boolean | null
  technique_check: string | null
  feedback: string | null
  model_answer: string | null
}

export interface ParaphraseStatItem {
  technique_key: string
  technique_name: string
  total: number
  correct: number
  accuracy: number
}

export interface ParaphraseHistoryItem {
  id: number
  technique_key: string
  technique_name: string
  original_sentence: string
  response: string
  applied_correctly: boolean | null
  feedback: string | null
  created_at: string | null
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useParaphraseNext() {
  const { request } = useHttp()

  return useQuery<ParaphraseNext>({
    queryKey: ['paraphrase-next'],
    queryFn: () => request(API_ENDPOINTS.PARAPHRASE.NEXT) as Promise<ParaphraseNext>,
    staleTime: 0,
  })
}

export function useParaphraseGrade() {
  const { request } = useHttp()
  const qc = useQueryClient()

  return useMutation<
    ParaphraseGradeResult,
    Error,
    { sentence_id: number; technique: string; response: string }
  >({
    mutationFn: (body) =>
      request(API_ENDPOINTS.PARAPHRASE.GRADE, {
        method: 'POST',
        body,
      }) as Promise<ParaphraseGradeResult>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paraphrase-stats'] })
      qc.invalidateQueries({ queryKey: ['paraphrase-history'] })
    },
  })
}

export function useParaphraseHistory(limit = 20) {
  const { request } = useHttp()

  return useQuery<ParaphraseHistoryItem[]>({
    queryKey: ['paraphrase-history', limit],
    queryFn: () =>
      request(API_ENDPOINTS.PARAPHRASE.HISTORY(limit)) as Promise<ParaphraseHistoryItem[]>,
    staleTime: 30_000,
  })
}

export function useParaphraseStats() {
  const { request } = useHttp()

  return useQuery<ParaphraseStatItem[]>({
    queryKey: ['paraphrase-stats'],
    queryFn: () =>
      request(API_ENDPOINTS.PARAPHRASE.STATS) as Promise<ParaphraseStatItem[]>,
    staleTime: 30_000,
  })
}
