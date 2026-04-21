import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import "./globals.css"
import { QueryProvider } from '@/lib/providers/query-provider'
import { Header } from '@/components/layouts/header'
import { Providers } from './providers'
import { AuthProvider } from '@/lib/providers/auth-provider'
import { PwaRegister } from '@/components/pwa-register'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Life Tracker',
  description: 'Comprehensive self-improvement tracking platform',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Life Tracker',
  },
  formatDetection: {
    telephone: false,
  },
  themeColor: '#6366f1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-512.svg" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={inter.className}>
        <QueryProvider>
          <PwaRegister />
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