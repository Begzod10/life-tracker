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
                console.log('🔵 OAuth данные от Google:', {
                    email: user.email,
                    name: user.name,
                    provider: account?.provider,
                })

                const url = `${process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL}/auth/${account?.provider}`
                console.log(`🔗 Отправляем запрос на: ${url}`)
                console.log(`📦 Тело запроса:`, JSON.stringify({ token: account?.id_token }))

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: account?.id_token })
                })

                if (!response.ok) {
                    const errorText = await response.text()
                    console.error('❌ Backend error status:', response.status, response.statusText)
                    console.error('❌ Backend error details:', errorText)
                    return false
                }

                const data = await response.json()
                console.log('✅ Backend ответил:', data)

                user.accessToken = data.access_token
                user.refreshToken = data.refresh_token || data.access_token
                user.backendUser = data.user

                return true

            } catch (error) {
                console.error('💥 Error:', error)
                return false
            }
        },

        async jwt({ token, user }) {
            if (user) {
                console.log('💾 JWT callback - сохраняем токены')
                token.accessToken = user.accessToken
                token.refreshToken = user.refreshToken
                token.backendUser = user.backendUser
                token.accessTokenExpiry = Date.now() + 25 * 60 * 1000
            }

            const expiry = token.accessTokenExpiry as number | undefined
            if (expiry && Date.now() > expiry) {
                try {
                    const response = await fetch(
                        `${process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ refresh_token: token.refreshToken }),
                        }
                    )
                    if (response.ok) {
                        const data = await response.json()
                        token.accessToken = data.access_token
                        token.refreshToken = data.refresh_token
                        token.accessTokenExpiry = Date.now() + 25 * 60 * 1000
                        if (data.user) token.backendUser = data.user
                    }
                } catch { }
            }

            return token
        },

        async session({ session, token }) {
            session.accessToken = token.accessToken as string
            session.refreshToken = token.refreshToken as string
            session.user = token.backendUser as any
            return session
        },

        async redirect({ url, baseUrl }) {
            if (url.includes('/auth')) return `${baseUrl}/platform`
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