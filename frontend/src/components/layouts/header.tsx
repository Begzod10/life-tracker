'use client'

import { Button } from '@/components/ui/button'
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, Bell, User } from 'lucide-react'

export function Header() {
    const router = useRouter()
    const location = usePathname()
    const searchParams = useSearchParams()

    const isRoot = location === '/platform' && searchParams.size === 0
    const isHome = location === '/'

    return (
        <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="sticky top-0 z-50 bg-[#1a1b26]/80 backdrop-blur-xl border-b border-[#2a2b36]"
        >
            <div className="container mx-auto px-4 sm:px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                    {/* Left - Back Button or Logo */}
                    {(!isRoot && !isHome) ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.back()}
                            className="gap-2"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Button>
                    ) : (
                        <span className="text-white font-semibold">Life Tracking</span>
                    )}

                    {/* Right - Notifications & Profile */}
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="h-5 w-5" />
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/platform/profile')}
                        >
                            <User className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>
        </motion.header>
    )
}
