'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useUser } from '@/lib/hooks/use-auth'
import {
    BookOpen,
    Dumbbell,
    NotebookText,
    PenLine,
    Library as LibraryIcon,
    GraduationCap,
    CalendarClock,
    Wallet,
    Coins,
    PiggyBank,
    HeartPulse,
    LayoutGrid,
    ArrowLeft,
    User as UserIcon,
    Target,
    CheckSquare,
} from 'lucide-react'

type NavItem = {
    name: string
    href: string
    icon: React.ComponentType<{ className?: string }>
    /** active when current path starts with this prefix (in addition to exact match) */
    matchPrefix?: boolean
}

type NavSection = {
    label?: string
    items: NavItem[]
}

function buildSections(id: string): NavSection[] {
    const base = `/platform/${id}`
    return [
        {
            items: [
                { name: 'Goals', href: '/platform?category=goals', icon: Target },
                { name: 'Tasks', href: '/platform?category=tasks', icon: CheckSquare },
                { name: 'Timetable', href: `${base}/timetable`, icon: CalendarClock, matchPrefix: true },
            ],
        },
        {
            label: 'Learning',
            items: [
                { name: 'Library', href: `${base}/learning/library`, icon: LibraryIcon, matchPrefix: true },
                { name: 'Practice', href: `${base}/learning/practice`, icon: Dumbbell, matchPrefix: true },
                { name: 'Dictionary', href: `${base}/learning/dictionary`, icon: NotebookText, matchPrefix: true },
                { name: 'Writing', href: `${base}/learning/writing`, icon: PenLine, matchPrefix: true },
                { name: 'Reading', href: `${base}/learning/reading`, icon: BookOpen, matchPrefix: true },
                { name: 'Overview', href: `${base}/learning`, icon: GraduationCap },
            ],
        },
        {
            label: 'Money',
            items: [
                { name: 'Finances', href: `${base}/finances`, icon: Wallet, matchPrefix: true },
                { name: 'Salary', href: `${base}/salary`, icon: Coins, matchPrefix: true },
                { name: 'Savings', href: `${base}/savings`, icon: PiggyBank, matchPrefix: true },
            ],
        },
        {
            label: 'Life',
            items: [
                { name: 'Health', href: `${base}/health`, icon: HeartPulse, matchPrefix: true },
            ],
        },
    ]
}

function isItemActive(pathname: string, item: NavItem): boolean {
    // For hub-category links like /platform?category=tasks, treat the
    // pathname-only portion as the comparison key — query-param matching
    // would require useSearchParams, which forces a Suspense bailout we
    // want to avoid here.
    const itemPath = item.href.split('?')[0]
    if (pathname === itemPath) return true
    if (item.matchPrefix && pathname.startsWith(`${itemPath}/`)) return true
    return false
}

export function Sidebar() {
    const params = useParams<{ id: string }>()
    const pathname = usePathname() ?? ''
    const { data: user } = useUser()

    // Prefer URL param so the sidebar reflects the route you're already on;
    // fall back to the authenticated user when the route has no [id]
    // (e.g. /platform, /platform/profile).
    const id = params?.id ?? (user?.id != null ? String(user.id) : undefined)

    if (!id) {
        return null
    }

    const sections = buildSections(String(id))

    return (
        <aside className="hidden lg:flex h-screen w-60 flex-col fixed left-0 top-0 z-30 bg-[#0f1015]/95 border-r border-white/5 backdrop-blur-sm">
            {/* Brand + back to hub */}
            <div className="flex flex-col gap-3 p-4 border-b border-white/5">
                <Link href="/platform" className="flex items-center gap-2 group">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <LayoutGrid className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-base font-semibold tracking-tight text-white">LifeTrack</span>
                </Link>

                <Link
                    href="/platform"
                    className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    All categories
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
                {sections.map((section, sectionIdx) => (
                    <div key={section.label ?? `section-${sectionIdx}`} className="space-y-1">
                        {section.label && (
                            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                                {section.label}
                            </div>
                        )}
                        {section.items.map((item) => {
                            const Icon = item.icon
                            const active = isItemActive(pathname, item)
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                                        active
                                            ? 'bg-white/10 text-white shadow-sm shadow-black/20'
                                            : 'text-white/55 hover:bg-white/[0.04] hover:text-white'
                                    )}
                                >
                                    <Icon
                                        className={cn(
                                            'h-4 w-4 shrink-0 transition-colors',
                                            active ? 'text-indigo-300' : 'text-white/40 group-hover:text-white/70'
                                        )}
                                    />
                                    <span className="truncate">{item.name}</span>
                                </Link>
                            )
                        })}
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div className="border-t border-white/5 p-3">
                <Link
                    href="/platform/profile"
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/55 hover:bg-white/[0.04] hover:text-white transition-colors"
                >
                    <UserIcon className="h-4 w-4 text-white/40" />
                    Profile
                </Link>
            </div>
        </aside>
    )
}
