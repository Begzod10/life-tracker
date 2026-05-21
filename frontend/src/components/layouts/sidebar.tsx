'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
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
    Menu,
    X,
} from 'lucide-react'

type NavItem = {
    name: string
    href: string
    icon: React.ComponentType<{ className?: string }>
    /** active when current path starts with this prefix (in addition to exact match) */
    matchPrefix?: boolean
    /**
     * Hub-category items render under /platform with a ?category=… query.
     * They never match by pathname alone (because the pathname is shared)
     * so we activate them by query string instead.
     */
    hubCategory?: string
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
                { name: 'Goals', href: '/platform?category=goals', icon: Target, hubCategory: 'goals' },
                { name: 'Tasks', href: '/platform?category=tasks', icon: CheckSquare, hubCategory: 'tasks' },
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

function isItemActive(
    pathname: string,
    item: NavItem,
    hubCategoryParam: string | null,
): boolean {
    // Hub-category items share the /platform pathname, so they must match
    // by ?category=… instead of by path. Without this two items collide.
    if (item.hubCategory) {
        return pathname === '/platform' && hubCategoryParam === item.hubCategory
    }
    if (pathname === item.href) return true
    if (item.matchPrefix && pathname.startsWith(`${item.href}/`)) return true
    return false
}

function SidebarContent({
    sections,
    pathname,
    hubCategoryParam,
    onNavigate,
}: {
    sections: NavSection[]
    pathname: string
    hubCategoryParam: string | null
    onNavigate?: () => void
}) {
    return (
        <>
            {/* Brand + back to hub */}
            <div className="flex flex-col gap-3 p-4 border-b border-white/5">
                <Link href="/platform" onClick={onNavigate} className="flex items-center gap-2 group">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <LayoutGrid className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-base font-semibold tracking-tight text-white">LifeTrack</span>
                </Link>

                <Link
                    href="/platform"
                    onClick={onNavigate}
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
                            const active = isItemActive(pathname, item, hubCategoryParam)
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onNavigate}
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
                    onClick={onNavigate}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/55 hover:bg-white/[0.04] hover:text-white transition-colors"
                >
                    <UserIcon className="h-4 w-4 text-white/40" />
                    Profile
                </Link>
            </div>
        </>
    )
}

export function Sidebar() {
    const params = useParams<{ id: string }>()
    const pathname = usePathname() ?? ''
    const searchParams = useSearchParams()
    const hubCategoryParam = searchParams?.get('category') ?? null
    const { data: user } = useUser()
    const [mobileOpen, setMobileOpen] = useState(false)

    // Auto-close the drawer whenever the route changes — otherwise clicking
    // a link on mobile leaves the drawer open over the new page.
    useEffect(() => {
        setMobileOpen(false)
    }, [pathname, hubCategoryParam])

    // Lock body scroll while the mobile drawer is open so the underlying
    // page doesn't scroll under it.
    useEffect(() => {
        if (!mobileOpen) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [mobileOpen])

    // Prefer URL param so the sidebar reflects the route you're already on;
    // fall back to the authenticated user when the route has no [id]
    // (e.g. /platform, /platform/profile).
    const id = params?.id ?? (user?.id != null ? String(user.id) : undefined)

    if (!id) {
        return null
    }

    const sections = buildSections(String(id))

    return (
        <>
            {/* Mobile hamburger — fixed top-left, only visible <lg. Sits above
                the platform header so it's reachable on every page. */}
            <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
                className="lg:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-white/80 hover:text-white hover:bg-white/15 flex items-center justify-center shadow-lg"
            >
                <Menu className="h-5 w-5" />
            </button>

            {/* Mobile backdrop */}
            {mobileOpen && (
                <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setMobileOpen(false)}
                    className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                />
            )}

            {/* Mobile drawer — slides in from the left below lg. */}
            <aside
                className={cn(
                    'lg:hidden fixed left-0 top-0 bottom-0 z-50 w-[min(17rem,85vw)] flex flex-col bg-[#0a0a14] border-r border-white/10 shadow-2xl transition-transform duration-200',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full',
                )}
            >
                <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    aria-label="Close menu"
                    className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg text-white/50 hover:text-white hover:bg-white/5 flex items-center justify-center"
                >
                    <X className="h-4 w-4" />
                </button>
                <SidebarContent
                    sections={sections}
                    pathname={pathname}
                    hubCategoryParam={hubCategoryParam}
                    onNavigate={() => setMobileOpen(false)}
                />
            </aside>

            {/* Desktop sidebar — unchanged behaviour. */}
            <aside className="hidden lg:flex h-screen w-60 flex-col fixed left-0 top-0 z-30 bg-white/[0.03] border-r border-white/5 backdrop-blur-xl">
                <SidebarContent
                    sections={sections}
                    pathname={pathname}
                    hubCategoryParam={hubCategoryParam}
                />
            </aside>
        </>
    )
}
