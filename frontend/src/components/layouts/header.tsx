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
    // Book reader has its own full-screen chrome — hide the platform header there
    const isBookReader = /\/platform\/[^/]+\/learning\/library\/[^/]+$/.test(location ?? '')

    if (isBookReader) return null

    return (
        <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="sticky top-0 z-50 bg-white/[0.03] backdrop-blur-xl border-b border-white/5"
        >
            <div className="container mx-auto px-4 sm:px-6 py-2 sm:py-4">
                <div className="flex items-center justify-between gap-4">
                    {/* Left - Back Button or Logo.
                        On mobile <lg the sidebar renders its own hamburger
                        fixed at top-left, so we offset this column to keep
                        them from colliding. */}
                    <div className="pl-12 lg:pl-0">
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
                    </div>

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
