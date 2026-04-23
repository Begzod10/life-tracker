import { useState, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { AuthTokens } from '@/lib/utils/auth'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

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

// Singleton для refresh — чтобы при параллельных 401 рефреш вызвался один раз
let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
    if (refreshPromise) return refreshPromise

    refreshPromise = (async () => {
        let refreshToken = AuthTokens.getRefreshToken()

        // No token in localStorage — may be right after OAuth login before AuthSync ran.
        // Pull the refresh token from the NextAuth session and use it to call /auth/refresh.
        // Do NOT return session.accessToken directly — it may already be expired.
        if (!refreshToken) {
            const sessionRes = await fetch('/api/auth/session')
            if (sessionRes.ok) {
                const session = await sessionRes.json()
                if (session?.refreshToken) {
                    refreshToken = session.refreshToken as string
                }
            }
            if (!refreshToken) throw new Error('No refresh token')
        }

        const response = await fetch(API_ENDPOINTS.AUTH.REFRESH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        })

        if (!response.ok) {
            AuthTokens.clearTokens()
            throw new Error('SESSION_EXPIRED')
        }

        const data = await response.json()
        AuthTokens.setTokens(data.access_token, data.refresh_token)
        return data.access_token as string
    })().finally(() => {
        refreshPromise = null
    })

    return refreshPromise
}

function buildConfig(options: RequestOptions, token: string | null): RequestInit {
    const { method = 'GET', body = null, headers = {} } = options

    const config: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
            const token = AuthTokens.getAccessToken()
            const response = await fetch(url, buildConfig(options, token))

            // При 401 — рефрешим и повторяем запрос один раз
            if (response.status === 401) {
                try {
                    const newToken = await refreshAccessToken()
                    const retryResponse = await fetch(url, buildConfig(options, newToken))
                    const retryData = await parseResponse(retryResponse)

                    if (!retryResponse.ok) {
                        const errorMessage = retryData?.error || retryData?.message || `HTTP error ${retryResponse.status}`
                        throw new Error(errorMessage)
                    }

                    setLoading(false)
                    return retryData
                } catch (refreshError: any) {
                    if (refreshError.message === 'SESSION_EXPIRED' || refreshError.message === 'No refresh token') {
                        // Clear the NextAuth session so AuthSync can't re-seed stale tokens
                        // on the next page load, then redirect to the login page.
                        signOut({ redirect: false }).finally(() => {
                            window.location.replace('/auth')
                        })
                    }
                    throw refreshError
                }
            }

            const data = await parseResponse(response)

            if (!response.ok) {
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
                return `${encodeURIComponent(key)}=${value.join(',')}`
            }
            return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
        })
        .join('&')

    return filtered ? `?${filtered}` : ''
}
