const COOKIE_NAME = 'access_token'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

function setCookie(value: string) {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`
}

function deleteCookie() {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`
}

export const AuthTokens = {
    setTokens: (access: string, refresh: string) => {
        localStorage.setItem('access_token', access)
        localStorage.setItem('refresh_token', refresh)
        setCookie(access)
    },

    getAccessToken: () => {
        if (typeof window === 'undefined') return null
        const ls = localStorage.getItem('access_token')
        if (ls) return ls
        // Fallback: читаем из cookie если localStorage ещё пуст
        const match = document.cookie.match(/(?:^|; )access_token=([^;]*)/)
        return match ? decodeURIComponent(match[1]) : null
    },

    getRefreshToken: () => {
        if (typeof window === 'undefined') return null
        return localStorage.getItem('refresh_token')
    },

    clearTokens: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        deleteCookie()
    },

    isAuthenticated: () => {
        return !!AuthTokens.getAccessToken()
    },
}