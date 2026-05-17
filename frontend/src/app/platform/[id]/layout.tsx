'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useUser } from '@/lib/hooks/use-auth'
import { Sidebar } from '@/components/layouts/sidebar'

export default function UserLayout({ children }: { children: React.ReactNode }) {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const { data: user, isLoading } = useUser()

    useEffect(() => {
        if (isLoading) return
        if (user && String(user.id) !== params.id) {
            const subPath = window.location.pathname.split('/').slice(3).join('/')
            router.replace(`/platform/${user.id}/${subPath}`)
        }
    }, [user, isLoading, params.id, router])

    return (
        <div className="min-h-screen bg-background">
            <Sidebar />
            <div className="lg:pl-60">{children}</div>
        </div>
    )
}
