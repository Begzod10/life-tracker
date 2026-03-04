import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'
import { ProgressLog } from '@/types'

export function useProgressLogsByGoal(goalId: string | number) {
    const { request } = useHttp()

    return useQuery<ProgressLog[]>({
        queryKey: ['progress-logs', 'by-goal', goalId],
        queryFn: () => request(API_ENDPOINTS.PROGRESS_LOGS.GET_BY_GOAL(goalId)),
        enabled: !!goalId
    })
}

export function useProgressLogCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: Omit<ProgressLog, 'id' | 'created_at'>) => request(API_ENDPOINTS.PROGRESS_LOGS.CREATE, {
            method: 'POST',
            body: data
        }),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['progress-logs', 'by-goal', variables.goal_id],
                refetchType: 'active'  // <-- вот это добавь
            })
            queryClient.invalidateQueries({
                queryKey: ['goal', variables.goal_id],
                refetchType: 'active'  // <-- и тут
            })
        }
    })
}

export function useProgressLogUpdate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: { id: number | string, data: Partial<ProgressLog> }) =>
            request(API_ENDPOINTS.PROGRESS_LOGS.UPDATE(data.id), {
                method: 'PUT',
                body: data.data
            }),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['progress-logs'] })
            // Logic to invalidate specific goal logs if we knew the goal_id, 
            // but for now invalidating all progress-logs or we can return the updated log with goal_id
        }
    })
}

export function useProgressLogDelete() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: number | string) =>
            request(API_ENDPOINTS.PROGRESS_LOGS.DELETE(id), {
                method: 'DELETE'
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['progress-logs'] })
        }
    })
}

export function useProgressLogsByTask(taskId: string | number) {
    const { request } = useHttp()

    return useQuery<ProgressLog[]>({
        queryKey: ['progress-logs', 'by-task', taskId],
        queryFn: () => request(API_ENDPOINTS.PROGRESSLOG_TASK.GET_BY_TASK(taskId)),
        enabled: !!taskId
    })
}

export function useTaskProgressLogCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: Omit<ProgressLog, 'id' | 'created_at'>) => request(API_ENDPOINTS.PROGRESSLOG_TASK.CREATE, {
            method: 'POST',
            body: data
        }),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['progress-logs', 'by-task', variables.task_id],
                refetchType: 'active'
            })
            queryClient.invalidateQueries({
                queryKey: ['task', variables.task_id],
                refetchType: 'active'
            })
        }
    })
}
