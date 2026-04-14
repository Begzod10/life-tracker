import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'

export function useTasksList(filters?: {
    person_id?: string | number
    goal_id?: string | number
}) {
    const { request } = useHttp()

    return useQuery({
        queryKey: ['tasks', filters],
        queryFn: () => {
            // Prioritize person_id path param if present
            if (filters?.person_id) {
                // If goal_id is also present, we might need to append it as query to the person endpoint
                // or just use the person endpoint. For now, let's assume person endpoint is primary.
                const url = API_ENDPOINTS.TASKS.BY_PERSON(filters.person_id)
                const params = new URLSearchParams()
                if (filters.goal_id) params.append('goal_id', String(filters.goal_id))

                const queryString = params.toString()
                return request(queryString ? `${url}?${queryString}` : url)
            }

            const params = new URLSearchParams()
            if (filters?.goal_id) params.append('goal_id', String(filters.goal_id))

            const queryString = params.toString()
            return request(queryString ? `${API_ENDPOINTS.TASKS.LIST}?${queryString}` : API_ENDPOINTS.TASKS.LIST)
        },
        retry: false,
    })
}

export function useTasksByGoal(goalId: string | number) {
    const { request } = useHttp()

    return useQuery({
        queryKey: ['tasks', 'by-goal', goalId],
        queryFn: () => request(API_ENDPOINTS.TASKS.BY_GOAL(goalId)),
        enabled: !!goalId
    })
}

// Исправленный хук для получения профиля task по ID
export function useTaskProfile(id: number | string) {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    const router = useRouter()

    const query = useQuery({
        queryKey: ['task', id], // 👈 Уникальный ключ для каждой задачи
        queryFn: () => request(API_ENDPOINTS.TASKS.GET(String(id))), // 👈 Используем функцию для генерации URL
        enabled: !!id, // 👈 Запрос выполнится только если есть id
        retry: false,
    })

    const updateTask = useMutation({
        mutationFn: (data: { id: number | string, data: any }) =>
            request(API_ENDPOINTS.TASKS.UPDATE(String(data.id)), {
                method: 'PUT',
                body: data.data
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['task', id] })
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
        }
    })

    const deleteTask = useMutation({
        mutationFn: (id: number | string) =>
            request(API_ENDPOINTS.TASKS.DELETE(String(id)), {
                method: 'DELETE'
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
        }
    })

    return {
        ...query,
        updateTask,
        deleteTask
    }
}

export function useTaskCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    const router = useRouter()

    return useMutation({
        mutationFn: (data: any) => request(API_ENDPOINTS.TASKS.CREATE, {
            method: 'POST',
            body: data
        }),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            if (variables.goal_id) {
                queryClient.invalidateQueries({ queryKey: ['tasks', 'goal', String(variables.goal_id)] })
                queryClient.invalidateQueries({ queryKey: ['goal', String(variables.goal_id)] })
            }
        }
    })
}
export function useTasksStatsByPerson(personId?: string | number, timeRange: 'day' | 'week' | 'month' | 'year' | 'all' = 'week') {
    const { request } = useHttp()

    return useQuery({
        queryKey: ['tasks', 'stats', 'person', personId, timeRange],
        queryFn: async () => {
            const tasks: any[] = await request(API_ENDPOINTS.TASKS.BY_PERSON(personId!))
            const now = new Date()

            const cutoff: Date | null = (() => {
                if (timeRange === 'day')   { const d = new Date(now); d.setHours(0, 0, 0, 0); return d }
                if (timeRange === 'week')  return new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)
                if (timeRange === 'month') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                if (timeRange === 'year')  return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
                return null // 'all'
            })()

            const inPeriod = cutoff ? tasks.filter(t => new Date(t.created_at) >= cutoff) : tasks

            const total = inPeriod.length
            const completed = inPeriod.filter(t => t.completed).length
            const inProgress = inPeriod.filter(t => !t.completed).length
            const addedThisWeek = tasks.filter(t => new Date(t.created_at) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)).length
            const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

            return { total, completed, inProgress, addedThisWeek, completionRate }
        },
        enabled: !!personId,
        retry: false,
    })
}

export function useSubtaskCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: any) => request(API_ENDPOINTS.SUBTASKS.CREATE, {
            method: 'POST',
            body: data
        }),
        onSuccess: (_, variables) => {
            // Invalidate parent task query to update progress/subtasks list
            if (variables.task_id) {
                queryClient.invalidateQueries({ queryKey: ['task', variables.task_id] })
            }
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
        }
    })
}

export function useSubtasks(taskId: number | string) {
    const { request } = useHttp()

    return useQuery({
        queryKey: ['subtasks', taskId],
        queryFn: () => request(API_ENDPOINTS.SUBTASKS.GET_BY_TASK(taskId)),
        enabled: !!taskId
    })
}

export function useSubtaskUpdate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: { id: number | string, data: any }) =>
            request(API_ENDPOINTS.SUBTASKS.UPDATE(data.id), {
                method: 'PUT',
                body: data.data
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subtasks'] })
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
        }
    })
}

export function useSubtaskDelete() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: number | string) =>
            request(API_ENDPOINTS.SUBTASKS.DELETE(id), {
                method: 'DELETE'
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subtasks'] })
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
        }
    })
}

// ─── Recurring task completion history ───────────────────────────────────────
export type RecurringCompletion = {
    task_id: number
    task_name: string
    priority: string
    completions: string[]  // "YYYY-MM-DD" dates
}

export function useRecurringCompletions(goalId: string | number, weeks = 4) {
    const { request } = useHttp()
    return useQuery<RecurringCompletion[]>({
        queryKey: ['tasks', 'recurring-completions', goalId, weeks],
        queryFn: () => request(API_ENDPOINTS.TASKS.RECURRING_COMPLETIONS(goalId, weeks)),
        enabled: !!goalId,
    })
}
