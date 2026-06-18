import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useHttp } from './use-http'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Task2Session {
  session_id: number
  essay_type: 'essay_intro' | 'essay_paragraph' | 'essay_full'
  target_band: number
  question: string
  question_type: string
  topic_domain: string
  assigned_position: string | null
  drill_instruction: string | null
  essay_focus: string[]
  word_limits: { min: number; max: number | null }
}

export interface CriteriaScores {
  task_response: number | null
  coherence_cohesion: number | null
  lexical_resource: number | null
  grammatical_range_accuracy: number | null
}

export interface GrammarErrorItem {
  span: string
  category: string
  severity: 'major' | 'minor'
  correction: string
  rule: string
}

export interface Task2GradeResult {
  attempt_id: number
  criteria_scores: CriteriaScores
  overall_band: number | null
  is_correct: boolean
  essay_errors: string[] | null
  grammar_errors: GrammarErrorItem[]
  feedback: string | null
  model_revision: string | null
  word_count: number
}

export interface GrammarDrillItem {
  grammar_point_id: string
  priority: number
  mastery: number
  lapses: number
  next_review_at: string | null
}

export interface GrammarDrillQueue {
  drill_queue: GrammarDrillItem[]
}

export interface GrammarPointEntry {
  id: string
  name: string
  cefr: string
  priority: number
  rule: string
  l1_notes: string
  common_errors: Array<{ wrong: string; right: string }>
  examples: string[]
  mastery: number
  lapses: number
  priority_score: number
  next_review_at: string | null
}

export interface GrammarPointsResponse {
  points: GrammarPointEntry[]
}

export interface Task2HistoryItem {
  id: number
  essay_type: string
  question: string
  question_type: string
  overall_band: number | null
  criteria_scores: CriteriaScores | null
  is_correct: boolean
  word_count: number
  feedback: string | null
  created_at: string | null
}

export interface Task2History {
  total: number
  page: number
  limit: number
  items: Task2HistoryItem[]
}

export interface Task2Analytics {
  total_attempts: number
  recent_30: number
  avg_band_30: number | null
  essay_focus: string[]
  band_trends: Record<string, string>
  type_distribution: Record<string, number>
  recent_bands: Array<{ overall_band: number | null; created_at: string | null }>
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useTask2Start(platformId: string) {
  const { request } = useHttp()
  const qc = useQueryClient()

  return useMutation<Task2Session, Error, { target_band?: number }>({
    mutationFn: ({ target_band = 7.0 }) =>
      request(API_ENDPOINTS.TASK2.START, {
        method: 'POST',
        body: { target_band },
      }) as Promise<Task2Session>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task2-history', platformId] })
      qc.invalidateQueries({ queryKey: ['task2-analytics', platformId] })
    },
  })
}

export function useTask2Grade(platformId: string) {
  const { request } = useHttp()
  const qc = useQueryClient()

  return useMutation<
    Task2GradeResult,
    Error,
    { session_id: number; response: string; time_seconds?: number }
  >({
    mutationFn: (body) =>
      request(API_ENDPOINTS.TASK2.GRADE, {
        method: 'POST',
        body,
      }) as Promise<Task2GradeResult>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task2-history', platformId] })
      qc.invalidateQueries({ queryKey: ['task2-analytics', platformId] })
    },
  })
}

export function useTask2History(platformId: string, page = 1, limit = 20) {
  const { request } = useHttp()

  return useQuery<Task2History>({
    queryKey: ['task2-history', platformId, page, limit],
    queryFn: () =>
      request(API_ENDPOINTS.TASK2.HISTORY(page, limit)) as Promise<Task2History>,
    staleTime: 30_000,
  })
}

export function useTask2Analytics(platformId: string) {
  const { request } = useHttp()

  return useQuery<Task2Analytics>({
    queryKey: ['task2-analytics', platformId],
    queryFn: () =>
      request(API_ENDPOINTS.TASK2.ANALYTICS) as Promise<Task2Analytics>,
    staleTime: 60_000,
  })
}

export function useGrammarDrillQueue(platformId: string, limit = 5) {
  const { request } = useHttp()

  return useQuery<GrammarDrillQueue>({
    queryKey: ['grammar-drill-queue', platformId, limit],
    queryFn: () =>
      request(API_ENDPOINTS.TASK2.GRAMMAR_DRILL_QUEUE(limit)) as Promise<GrammarDrillQueue>,
    staleTime: 60_000,
  })
}

export function useGrammarPoints(platformId: string) {
  const { request } = useHttp()

  return useQuery<GrammarPointsResponse>({
    queryKey: ['grammar-points', platformId],
    queryFn: () =>
      request(API_ENDPOINTS.TASK2.GRAMMAR_POINTS) as Promise<GrammarPointsResponse>,
    staleTime: 120_000,
  })
}
