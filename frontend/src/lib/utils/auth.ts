// Auth tokens now live in httpOnly cookies set by the backend. The browser
// can't read them, but it sends them automatically on `credentials: 'include'`
// fetches. This module remains as a small shim for code that used to call
// AuthTokens directly — keep the shape minimal.

export const AuthTokens = {
    /**
     * Best-effort sign-out hint. The real cookie clearing is done by the
     * backend's /auth/logout endpoint; this only removes any non-httpOnly
     * crumbs left over from earlier versions.
     */
    clearTokens: () => {
        if (typeof document === 'undefined') return
        // Old non-httpOnly access_token cookie used by previous middleware.
        document.cookie = 'access_token=; path=/; max-age=0'
        try {
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
        } catch {
            // Ignore — Safari private mode etc.
        }
    },
}
