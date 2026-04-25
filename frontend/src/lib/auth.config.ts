import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'

const YandexProvider = {
    id: 'yandex',
    name: 'Yandex',
    type: 'oauth' as const,
    authorization: {
        url: 'https://oauth.yandex.ru/authorize',
        params: { scope: 'login:email login:info' }
    },
    token: 'https://oauth.yandex.ru/token',
    userinfo: 'https://login.yandex.ru/info?format=json',
    clientId: process.env.YANDEX_CLIENT_ID,
    clientSecret: process.env.YANDEX_CLIENT_SECRET,
    profile(profile: any) {
        return {
            id: profile.id,
            name: profile.real_name || profile.display_name,
            email: profile.default_email,
            image: profile.default_avatar_id
                ? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
                : null
        }
    }
}

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
        YandexProvider as any,
        GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        }),
    ],

    pages: {
        signIn: '/auth',
        error: '/auth',
    },

    callbacks: {
        async signIn({ user, account }) {
            try {
                const url = `${process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL}/auth/${account?.provider}`
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: account?.id_token })
                })

                if (!response.ok) return false

                const data = await response.json()
                user.accessToken = data.access_token
                user.refreshToken = data.refresh_token || data.access_token
                user.backendUser = data.user

                return true
            } catch {
                return false
            }
        },

        async jwt({ token, user }) {
            if (user) {
                token.accessToken = user.accessToken
                token.refreshToken = user.refreshToken
                token.backendUser = user.backendUser
            }
            // Token refresh is handled exclusively by use-http.ts on 401 responses.
            // Having two refresh callers would cause race conditions since the backend
            // rotates the refresh token on every call.
            return token
        },

        async session({ session, token }) {
            session.accessToken = token.accessToken as string
            session.refreshToken = token.refreshToken as string
            session.user = token.backendUser as any
            return session
        },

        async redirect({ url, baseUrl }) {
            // Only redirect away from the bare /auth page (no query params).
            // /auth?error=Callback must NOT be caught here — intercepting it would
            // silently discard the login failure and send the user to /platform
            // while unauthenticated, forcing them to log in a second time.
            if (url === `${baseUrl}/auth`) return `${baseUrl}/platform`
            if (url.startsWith(baseUrl)) return url
            return `${baseUrl}/platform`
        },
    },

    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60,
    },

    secret: process.env.NEXTAUTH_SECRET,
}