import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RequiredWord {
  word: string
  definition: string
}

export interface MiniBuildStart {
  question: string
  question_type: string
  required_words: RequiredWord[]
}

export interface MiniBuildGradeResult {
  id: number
  paraphrase_score: number
  vocab_score: number
  position_score: number
  total_score: number
  feedback: string | null
  model_answer: string | null
}

export interface MiniBuildStats {
  total: number
  avg_total: number | null
  avg_paraphrase: number | null
  avg_vocab: number | null
  avg_position: number | null
}

export interface MiniBuildHistoryItem {
  id: number
  question: string
  response: string
  total_score: number
  feedback: string | null
  created_at: string | null
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useMiniBuildStart() {
  const { request } = useHttp()

  return useMutation<MiniBuildStart, Error, void>({
    mutationFn: () =>
      request(API_ENDPOINTS.MINI_BUILD.START, {
        method: 'POST',
        body: {},
      }) as Promise<MiniBuildStart>,
  })
}

export function useMiniBuildGrade() {
  const { request } = useHttp()
  const qc = useQueryClient()

  return useMutation<
    MiniBuildGradeResult,
    Error,
    { question: string; question_type: string; required_words: RequiredWord[]; response: string }
  >({
    mutationFn: (body) =>
      request(API_ENDPOINTS.MINI_BUILD.GRADE, {
        method: 'POST',
        body,
      }) as Promise<MiniBuildGradeResult>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mini-build-stats'] })
      qc.invalidateQueries({ queryKey: ['mini-build-history'] })
    },
  })
}

export function useMiniBuildStats() {
  const { request } = useHttp()

  return useQuery<MiniBuildStats>({
    queryKey: ['mini-build-stats'],
    queryFn: () => request(API_ENDPOINTS.MINI_BUILD.STATS) as Promise<MiniBuildStats>,
    staleTime: 30_000,
  })
}

export function useMiniBuildHistory(limit = 20) {
  const { request } = useHttp()

  return useQuery<MiniBuildHistoryItem[]>({
    queryKey: ['mini-build-history', limit],
    queryFn: () =>
      request(API_ENDPOINTS.MINI_BUILD.HISTORY(limit)) as Promise<MiniBuildHistoryItem[]>,
    staleTime: 30_000,
  })
}
