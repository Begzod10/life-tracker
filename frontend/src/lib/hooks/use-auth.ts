import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { API_ENDPOINTS } from '../api/endpoints'
import { useHttp } from './use-http'

export function useUser() {
    const { request } = useHttp()

    return useQuery({
        queryKey: ['user'],
        queryFn: () => request(API_ENDPOINTS.AUTH.ME),
        retry: false, // Не повторять если 401
    })
}

export function useRegister() {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    const router = useRouter()

    return useMutation({
        mutationFn: (data: any) => request(API_ENDPOINTS.AUTH.REGISTER, {
            method: 'POST',
            body: data
        }),
        onSuccess: () => {
            // Обновить список целей
            queryClient.invalidateQueries({ queryKey: ['user'] })
            setTimeout(() => {
                router.push('/platform')
            }, 500) // Дай время на отображение success
        }
    })
}

export function useLogin() {
    const { request } = useHttp()
    const queryClient = useQueryClient()
    const router = useRouter()

    return useMutation({
        mutationFn: (data: any) => request(API_ENDPOINTS.AUTH.LOGIN, {
            method: 'POST',
            body: data
        }),
        onSuccess: () => {
            // Обновить список целей
            queryClient.invalidateQueries({ queryKey: ['user'] })
            setTimeout(() => {
                router.push('/platform')
            }, 500) // Дай время на отображение success
        }
    })
}