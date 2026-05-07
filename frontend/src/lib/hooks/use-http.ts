import { useState, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

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

// Coalesce parallel 401s into a single refresh call so we don't race the
// backend (which rotates the refresh token on every successful call).
let refreshPromise: Promise<void> | null = null

async function refreshSession(): Promise<void> {
    if (refreshPromise) return refreshPromise

    refreshPromise = (async () => {
        const response = await fetch(API_ENDPOINTS.AUTH.REFRESH, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            // Empty body — the refresh_token cookie carries the token.
            body: JSON.stringify({}),
        })

        if (!response.ok) {
            throw new Error('SESSION_EXPIRED')
        }
    })().finally(() => {
        refreshPromise = null
    })

    return refreshPromise
}

function buildConfig(options: RequestOptions): RequestInit {
    const { method = 'GET', body = null, headers = {} } = options

    const config: RequestInit = {
        method,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    }

    if (body) {
        if (body instanceof FormData) {
            const { 'Content-Type': _, ...restHeaders } = config.headers as Record<string, string>
            config.headers = restHeaders
            config.body = body
        } else {
            config.body = JSON.stringify(body)
        }
    }

    return config
}

async function parseResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
        return response.json()
    }
    return response.text()
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
            const response = await fetch(url, buildConfig(options))

            // 401 → try one refresh + retry. The refresh endpoint rotates
            // the cookies; the retried fetch automatically picks them up.
            if (response.status === 401) {
                try {
                    await refreshSession()
                    const retryResponse = await fetch(url, buildConfig(options))
                    const retryData = await parseResponse(retryResponse)

                    if (!retryResponse.ok) {
                        const errorMessage = retryData?.detail || retryData?.error || retryData?.message || `HTTP error ${retryResponse.status}`
                        throw new Error(errorMessage)
                    }

                    setLoading(false)
                    return retryData
                } catch (refreshError: any) {
                    if (refreshError.message === 'SESSION_EXPIRED') {
                        // NextAuth still holds a stale session; clear it before
                        // bouncing the user so AuthProvider can't re-bridge.
                        signOut({ redirect: false }).finally(() => {
                            window.location.replace('/auth')
                        })
                    }
                    throw refreshError
                }
            }

            const data = await parseResponse(response)

            if (!response.ok) {
                const errorMessage = data?.detail || data?.error || data?.message || `HTTP error ${response.status}`
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
                return `${encodeURIComponent(key)}=${value.join(',')}`
            }
            return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
        })
        .join('&')

    return filtered ? `?${filtered}` : ''
}
