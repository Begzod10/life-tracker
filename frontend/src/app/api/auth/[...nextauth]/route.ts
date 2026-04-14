// src/app/api/auth/[...nextauth]/route.ts
// NextAuth API route - обрабатывает все OAuth запросы

import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth.config'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }