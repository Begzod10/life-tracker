export const AuthTokens = {
    setTokens: (access: string, refresh: string) => {
        localStorage.setItem('access_token', access)
        localStorage.setItem('refresh_token', refresh)
        // Set cookie so middleware can detect authentication
        const maxAge = 60 * 60 * 24 * 30 // 30 days
        document.cookie = `access_token=${access}; path=/; max-age=${maxAge}`
    },

    getAccessToken: () => {
        if (typeof window === 'undefined') return null
        return localStorage.getItem('access_token')
    },

    getRefreshToken: () => {
        if (typeof window === 'undefined') return null
        return localStorage.getItem('refresh_token')
    },

    clearTokens: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        document.cookie = 'access_token=; path=/; max-age=0'
    },

    isAuthenticated: () => {
        return !!AuthTokens.getAccessToken()
    }
}