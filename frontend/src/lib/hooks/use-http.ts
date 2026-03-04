import { useState, useCallback } from 'react'

// src/lib/hooks/use-http.ts

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    body?: any
    headers?: Record<string, string>
}

interface UseHttpReturn {
    request: <T = any>(url: string, options?: RequestOptions) => Promise<T>
    loading: boolean
    error: string | null
    clearError: () => void
}

export const useHttp = (): UseHttpReturn => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const request = useCallback(async <T = any>(
        url: string,
        options: RequestOptions = {}
    ): Promise<T> => {
        setLoading(true)
        setError(null)

        try {
            const {
                method = 'GET',
                body = null,
                headers = {},
            } = options

            const config: RequestInit = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
            }

            const token = localStorage.getItem('access_token')
            if (token) {
                config.headers = {
                    ...config.headers,
                    'Authorization': `Bearer ${token}`
                }
            }

            if (body) {
                if (body instanceof FormData) {
                    // Для FormData не устанавливаем Content-Type
                    const { 'Content-Type': _, ...restHeaders } = config.headers as Record<string, string>
                    config.headers = restHeaders
                    config.body = body
                } else {
                    config.body = JSON.stringify(body)
                }
            }

            const response = await fetch(url, config)

            // Попытка распарсить JSON
            let data
            const contentType = response.headers.get('content-type')
            if (contentType && contentType.includes('application/json')) {
                data = await response.json()
            } else {
                data = await response.text()
            }

            if (!response.ok) {
                // Если сервер вернул ошибку с сообщением
                const errorMessage = data?.error || data?.message || `HTTP error ${response.status}`
                throw new Error(errorMessage)
            }

            setLoading(false)
            return data
        } catch (e: any) {
            setLoading(false)
            setError(e.message)
            throw e
        }
    }, [])

    const clearError = useCallback(() => {
        setError(null)
    }, [])

    return { request, loading, error, clearError }
}

// Утилита для создания query параметров
export const createQueryParams = (params: Record<string, any> = {}): string => {
    const filtered = Object.entries(params)
        .filter(([_, value]) =>
            value !== undefined &&
            value !== null &&
            value !== 'all' &&
            value !== ''
        )
        .map(([key, value]) => {
            if (Array.isArray(value)) {
                // Массив без кодирования запятых
                return `${encodeURIComponent(key)}=${value.join(',')}`
            }
            return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
        })
        .join('&')

    return filtered ? `?${filtered}` : ''
}