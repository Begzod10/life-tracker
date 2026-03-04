
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'
import { Milestone } from '@/types'

export function useMilestoneCreate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: Omit<Milestone, 'id' | 'created_at' | 'updated_at'>) => request(API_ENDPOINTS.MILESTONES.CREATE, {
            method: 'POST',
            body: data
        }),
        onSuccess: (_, variables) => {
            // Invalidate goal query to refresh milestones list if they are part of the goal object
            queryClient.invalidateQueries({ queryKey: ['goal', String(variables.goal_id)] })
            // If there's a specific milestones query, invalidate that too (not yet implemented)
        }
    })
}

export function useMilestonesByGoal(goalId: string | number) {
    const { request } = useHttp()

    return useQuery({
        queryKey: ['milestones', goalId],
        queryFn: async () => {
            const response = await request(API_ENDPOINTS.MILESTONES.GET_BY_GOAL(goalId))
            // Ensure we return an array
            return Array.isArray(response) ? response : []
        },
        enabled: !!goalId
    })
}

export function useMilestoneUpdate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, ...data }: Partial<Milestone> & { id: number | string }) => request(API_ENDPOINTS.MILESTONES.UPDATE(id), {
            method: 'PUT',
            body: data
        }),
        onSuccess: (_, variables) => {
            // Invalidate goal query to refresh milestones list
            // We assume goal_id is passed or available, if not we might need to invalidate all milestones or be more specific if we had the goal_id
            // For now, let's try to invalidate queries that look like they might contain this milestone
            queryClient.invalidateQueries({ queryKey: ['milestones'] })
            if (variables.goal_id) {
                queryClient.invalidateQueries({ queryKey: ['goal', String(variables.goal_id)] })
            }
        }
    })
}

export function useMilestoneDelete() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: number | string) => request(API_ENDPOINTS.MILESTONES.DELETE(id), {
            method: 'DELETE'
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['milestones'] })
            // We generally want to refetch the goal as well to update progress if calculated from milestones
            queryClient.invalidateQueries({ queryKey: ['goal'] }) // This might be too broad, but safe
        }
    })
}
