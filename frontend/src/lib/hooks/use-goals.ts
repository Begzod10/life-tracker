
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp, createQueryParams } from './use-http'
import { Goal } from '@/types'

// Query keys
export const goalKeys = {
   all: ['goals'] as const,
   list: (filters?: any) => [...goalKeys.all, { filters }] as const,
   detail: (id: string) => ['goals', id] as const,
}

export function useGoalsList(
   personId: string | number | undefined,
   filters?: {
      status_filter?: string
      category_filter?: string
   }
) {
   const { request } = useHttp()

   return useQuery({
      queryKey: goalKeys.list({ ...filters, person_id: personId }),
      queryFn: async () => {
         if (!personId) throw new Error('Person ID is required')

         const queryString = createQueryParams(filters)
         return request(`${API_ENDPOINTS.GOALS.GET_BY_PERSON(personId)}${queryString}`)
      },
      enabled: !!personId,
   })
}

export function useGoal(id: string | number | undefined) {
   const { request } = useHttp()

   return useQuery({
      queryKey: goalKeys.detail(String(id)),
      queryFn: () => request(API_ENDPOINTS.GOALS.GET(String(id))),
      enabled: !!id,
   })
}

export function useGoalsOverviewStats(personId: string | number) {
   const { request } = useHttp()

   return useQuery({
      queryKey: ['goals', 'overview-stats', personId],
      queryFn: () => request(API_ENDPOINTS.GOALS.OVERVIEW_STATS(String(personId))),
      enabled: !!personId,
   })
}

export function useGoalUpdate() {
   const { request } = useHttp()
   const queryClient = useQueryClient()

   return useMutation({
      mutationFn: ({ id, data }: { id: string | number; data: Partial<Goal> }) =>
         request(API_ENDPOINTS.GOALS.UPDATE(String(id)), {
            method: 'PUT',
            body: data
         }),
      onSuccess: (_, variables) => {
         queryClient.invalidateQueries({ queryKey: goalKeys.all })
         queryClient.invalidateQueries({ queryKey: ['goal', String(variables.id)] })
      },
   })
}

export function useGoalDelete() {
   const { request } = useHttp()
   const queryClient = useQueryClient()

   return useMutation({
      mutationFn: (id: string | number) => request(API_ENDPOINTS.GOALS.DELETE(String(id)), {
         method: 'DELETE'
      }),
      onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: goalKeys.all })
      },
   })
}

export function useDeletedGoalsList(personId: string | number) {
   const { request } = useHttp()
   console.log('useDeletedGoalsList hook called with:', personId);

   return useQuery({
      queryKey: ['goals', 'deleted', personId],
      queryFn: () => {
         console.log('Fetching deleted goals for:', personId);
         return request(API_ENDPOINTS.GOALS.DELETED_LIST(personId))
      },
      enabled: !!personId,
   })
}

export function useGoalRestore() {
   const { request } = useHttp()
   const queryClient = useQueryClient()

   return useMutation({
      mutationFn: (id: string | number) => request(API_ENDPOINTS.GOALS.RESTORE(id), {
         method: 'POST'
      }),
      onSuccess: (_, id) => {
         queryClient.invalidateQueries({ queryKey: goalKeys.all })
         // Также можно инвалидировать конкретно deleted список, но goalKeys.all должен покрыть все
      },
   })
}

export function useGoalProfile(id: string) {
   const { request } = useHttp()

   const query = useQuery({
      queryKey: ['goal', id],
      queryFn: () => request(API_ENDPOINTS.GOALS.GET_WITH_STATS(id)),
      enabled: !!id,
   })

   const updateGoal = useGoalUpdate()
   const deleteGoal = useGoalDelete()

   return {
      ...query,
      updateGoal,
      deleteGoal
   }
}

export function useGoalCreate() {
   const { request } = useHttp()
   const queryClient = useQueryClient()

   return useMutation({
      mutationFn: (data: Omit<Goal, 'id' | 'created_at' | 'updated_at'>) => request(API_ENDPOINTS.GOALS.CREATE, {
         method: 'POST',
         body: data
      }),
      onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: goalKeys.all })
      }
   })
}
