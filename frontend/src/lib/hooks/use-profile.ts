import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'

export interface Profile {
    id: number
    name: string
    email: string
    timezone: string
    profile_photo_url: string | null
    is_verified: boolean
    created_at: string
    updated_at: string
}

export const profileKeys = {
    all: ['profile'] as const,
}

export function useProfile() {
    const { request } = useHttp()

    return useQuery({
        queryKey: profileKeys.all,
        queryFn: () => request<Profile>(API_ENDPOINTS.PROFILE.GET),
    })
}

export function useProfileUpdate() {
    const { request } = useHttp()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: Partial<Pick<Profile, 'name' | 'email' | 'timezone'>>) =>
            request<Profile>(API_ENDPOINTS.PROFILE.UPDATE, { method: 'PUT', body: data }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: profileKeys.all })
        },
    })
}
