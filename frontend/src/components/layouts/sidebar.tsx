'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    Target,
    DollarSign,
    Heart,
    Repeat,
    BarChart3,
    Book,
    Users,
    Settings,
    CheckSquare,
    LayoutGrid,
    ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const navigation = [
    { name: 'Goals', href: '/platform/goals', icon: Target },
    { name: 'Tasks', href: '/platform/tasks', icon: CheckSquare },
    { name: 'Finances', href: '/platform/finances', icon: DollarSign },
    { name: 'Health', href: '/platform/health', icon: Heart },
    { name: 'Habits', href: '/platform/habits', icon: Repeat },
    { name: 'Learning', href: '/platform/learning', icon: Book },
    { name: 'Analytics', href: '/platform/analytics', icon: BarChart3 },
    { name: 'Social', href: '/platform/social', icon: Users },
]

export function Sidebar() {
    const pathname = usePathname()

    return (
        <div className="flex h-screen w-64 flex-col fixed left-0 top-0 bg-card border-r">
            {/* Logo + Back Button */}
            <div className="flex flex-col gap-2 p-4 border-b">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <LayoutGrid className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-xl font-bold">LifeTrack</span>
                </div>

                <Link href="/platform">
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Platform
                    </Button>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-4">
                <div className="space-y-1">
                    {navigation.map((item) => {
                        const isActive = pathname === item.href
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                )}
                            >
                                <item.icon className="h-5 w-5" />
                                {item.name}
                            </Link>
                        )
                    })}
                </div>
            </nav>

            {/* User section */}
            <div className="border-t p-4">
                <Link
                    href="/platform/settings"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                    <Settings className="h-5 w-5" />
                    Settings
                </Link>
            </div>
        </div>
    )
}