import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GapFillNext {
  word_id: number
  word: string
  definition: string
  gap_type: 'word_form_only' | 'preposition_only' | 'both'
  sentence: string
  word_form_answer: string | null
  word_form_distractor: string | null
  preposition_answer: string | null
  explanation: string | null
}

export interface GapFillGradeResult {
  id: number
  word_form_correct: boolean | null
  preposition_correct: boolean | null
  word_form_answer: string | null
  preposition_answer: string | null
  explanation: string | null
}

export interface GapFillStats {
  total: number
  word_form_correct: number
  preposition_correct: number
  word_form_accuracy: number
  preposition_accuracy: number
}

export interface GapFillHistoryItem {
  id: number
  word: string
  word_form_correct: boolean | null
  preposition_correct: boolean | null
  created_at: string | null
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useGapFillNext() {
  const { request } = useHttp()

  return useQuery<GapFillNext>({
    queryKey: ['gap-fill-next'],
    queryFn: () => request(API_ENDPOINTS.GAP_FILL.NEXT) as Promise<GapFillNext>,
    staleTime: 0,
  })
}

export function useGapFillGrade() {
  const { request } = useHttp()
  const qc = useQueryClient()

  return useMutation<
    GapFillGradeResult,
    Error,
    { word_id: number; word_form_response?: string; preposition_response?: string }
  >({
    mutationFn: (body) =>
      request(API_ENDPOINTS.GAP_FILL.GRADE, {
        method: 'POST',
        body,
      }) as Promise<GapFillGradeResult>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gap-fill-next'] })
      qc.invalidateQueries({ queryKey: ['gap-fill-stats'] })
      qc.invalidateQueries({ queryKey: ['gap-fill-history'] })
    },
  })
}

export function useGapFillStats() {
  const { request } = useHttp()

  return useQuery<GapFillStats>({
    queryKey: ['gap-fill-stats'],
    queryFn: () => request(API_ENDPOINTS.GAP_FILL.STATS) as Promise<GapFillStats>,
    staleTime: 30_000,
  })
}

export function useGapFillHistory(limit = 20) {
  const { request } = useHttp()

  return useQuery<GapFillHistoryItem[]>({
    queryKey: ['gap-fill-history', limit],
    queryFn: () =>
      request(API_ENDPOINTS.GAP_FILL.HISTORY(limit)) as Promise<GapFillHistoryItem[]>,
    staleTime: 30_000,
  })
}
