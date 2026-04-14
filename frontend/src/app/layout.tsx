import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import "./globals.css"
import { QueryProvider } from '@/lib/providers/query-provider'
import { Header } from '@/components/layouts/header'
import { Providers } from './providers'
import { AuthProvider } from '@/lib/providers/auth-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Life Tracking System',
  description: 'Comprehensive self-improvement tracking platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
          {/* <Providers> */}
          {/* </Providers> */}
        </QueryProvider>
      </body>
    </html>
  )
}