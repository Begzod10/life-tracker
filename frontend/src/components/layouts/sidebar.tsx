'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useUser } from '@/lib/hooks/use-auth'
import type { WeatherData } from '@/lib/hooks/use-weather'
import { WeatherWidget } from '@/components/features/weather/weather-background'
import {
    BookOpen,
    Dumbbell,
    NotebookText,
    PenLine,
    Library as LibraryIcon,
    GraduationCap,
    ListChecks,
    CalendarClock,
    Wallet,
    Coins,
    PiggyBank,
    HeartPulse,
    LayoutGrid,
    LayoutDashboard,
    ArrowLeft,
    User as UserIcon,
    Target,
    CheckSquare,
    Menu,
    Newspaper,
    X,
    PanelLeftClose,
} from 'lucide-react'

type NavItem = {
    name: string
    href: string
    icon: React.ComponentType<{ className?: string }>
    matchPrefix?: boolean
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
                { name: 'Dashboard', href: base, icon: LayoutDashboard },
                { name: 'Goals', href: '/platform?category=goals', icon: Target, hubCategory: 'goals' },
                { name: 'Tasks', href: '/platform?category=tasks', icon: CheckSquare, hubCategory: 'tasks' },
                { name: 'Timetable', href: `${base}/timetable`, icon: CalendarClock, matchPrefix: true },
                { name: 'News', href: `${base}/news`, icon: Newspaper, matchPrefix: true },
            ],
        },
        {
            label: 'Learning',
            items: [
                { name: 'Library', href: `${base}/learning/library`, icon: LibraryIcon, matchPrefix: true },
                { name: 'Practice', href: `${base}/learning/practice`, icon: Dumbbell, matchPrefix: true },
                { name: 'Exercise', href: `${base}/learning/exercises`, icon: ListChecks, matchPrefix: true },
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
    onCollapse,
    weather,
}: {
    sections: NavSection[]
    pathname: string
    hubCategoryParam: string | null
    onNavigate?: () => void
    onCollapse?: () => void
    weather?: WeatherData | null
}) {
    return (
        <>
            {/* Brand + back to hub */}
            <div className="flex flex-col gap-3 p-4 border-b border-white/5">
                <div className="flex items-center justify-between">
                    <Link href="/platform" onClick={onNavigate} className="flex items-center gap-2 group">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
                            <LayoutGrid className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-base font-semibold tracking-tight text-white truncate">LifeTrack</span>
                    </Link>
                    {onCollapse && (
                        <button
                            type="button"
                            onClick={onCollapse}
                            title="Collapse sidebar"
                            className="text-white/30 hover:text-white/70 hover:bg-white/5 rounded-lg p-1.5 transition-colors shrink-0"
                        >
                            <PanelLeftClose className="h-4 w-4" />
                        </button>
                    )}
                </div>

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

            {weather && (
                <div className="px-3 pb-3 pt-1">
                    <WeatherWidget data={weather} />
                </div>
            )}

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

const MIN_W = 180
const MAX_W = 420
const DEFAULT_W = 240
const LS_WIDTH = 'sidebar-w'
const LS_COLLAPSED = 'sidebar-collapsed'

export function Sidebar({ weather }: { weather?: WeatherData | null } = {}) {
    const params = useParams<{ id: string }>()
    const pathname = usePathname() ?? ''
    const searchParams = useSearchParams()
    const hubCategoryParam = searchParams?.get('category') ?? null
    const { data: user } = useUser()
    const [mobileOpen, setMobileOpen] = useState(false)
    const [collapsed, setCollapsed] = useState(false)
    const [width, setWidth] = useState(DEFAULT_W)
    const [resizing, setResizing] = useState(false)
    const isResizing = useRef(false)
    const startX = useRef(0)
    const startW = useRef(0)

    // Restore persisted state on mount
    useEffect(() => {
        const w = parseInt(localStorage.getItem(LS_WIDTH) ?? '', 10)
        const c = localStorage.getItem(LS_COLLAPSED) === 'true'
        if (!isNaN(w)) setWidth(Math.min(MAX_W, Math.max(MIN_W, w)))
        setCollapsed(c)
    }, [])

    // Sync CSS variable used by layout to offset the main content
    const isBookReader = /\/platform\/[^/]+\/learning\/library\/[^/]+$/.test(pathname)
    useEffect(() => {
        const w = collapsed ? 0 : width
        document.documentElement.style.setProperty('--sidebar-w', `${w}px`)
        localStorage.setItem(LS_COLLAPSED, String(collapsed))
        if (!collapsed) localStorage.setItem(LS_WIDTH, String(width))
        // On the book reader, collapsing the sidebar also hides the platform
        // header to give a distraction-free reading mode.
        if (collapsed && isBookReader) {
            document.documentElement.classList.add('reader-fullscreen')
        } else {
            document.documentElement.classList.remove('reader-fullscreen')
        }
    }, [collapsed, width, isBookReader])

    // Resize drag listeners
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isResizing.current) return
            document.documentElement.classList.add('sidebar-resizing')
            const newW = Math.min(MAX_W, Math.max(MIN_W, startW.current + e.clientX - startX.current))
            setWidth(newW)
        }
        const onUp = () => {
            if (!isResizing.current) return
            document.documentElement.classList.remove('sidebar-resizing')
            isResizing.current = false
            setResizing(false)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
    }, [])

    const startResize = (e: React.MouseEvent) => {
        e.preventDefault()
        isResizing.current = true
        startX.current = e.clientX
        startW.current = width
        setResizing(true)
    }

    // Auto-close mobile drawer on route change
    useEffect(() => { setMobileOpen(false) }, [pathname, hubCategoryParam])

    // Lock body scroll while mobile drawer is open
    useEffect(() => {
        if (!mobileOpen) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [mobileOpen])

    const id = params?.id ?? (user?.id != null ? String(user.id) : undefined)
    if (!id) return null

    const sections = buildSections(String(id))

    return (
        <>
            {/* Mobile hamburger */}
            <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
                className="lg:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-white/80 hover:text-white hover:bg-white/15 flex items-center justify-center shadow-lg"
            >
                <Menu className="h-5 w-5" />
            </button>

            {/* Desktop hamburger — shown only when sidebar is collapsed */}
            {collapsed && (
                <button
                    type="button"
                    onClick={() => setCollapsed(false)}
                    aria-label="Open sidebar"
                    className="hidden lg:flex fixed top-3 left-3 z-40 w-10 h-10 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-white/80 hover:text-white hover:bg-white/15 items-center justify-center shadow-lg transition-colors"
                >
                    <Menu className="h-5 w-5" />
                </button>
            )}

            {/* Mobile backdrop */}
            {mobileOpen && (
                <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setMobileOpen(false)}
                    className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                />
            )}

            {/* Mobile drawer */}
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
                    weather={weather ?? null}
                />
            </aside>

            {/* Desktop sidebar */}
            <aside
                className={cn(
                    'hidden lg:flex flex-col fixed left-0 top-0 z-30 h-screen',
                    'bg-white/[0.03] border-r border-white/5 backdrop-blur-xl overflow-hidden',
                    !resizing && 'transition-[width] duration-200 ease-in-out',
                )}
                style={{ width: collapsed ? 0 : width }}
            >
                <SidebarContent
                    sections={sections}
                    pathname={pathname}
                    hubCategoryParam={hubCategoryParam}
                    onCollapse={() => setCollapsed(true)}
                />

                {/* Resize drag handle */}
                <div
                    onMouseDown={startResize}
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize group"
                >
                    <div className="absolute inset-y-0 right-0 w-px bg-white/5 group-hover:bg-indigo-400/50 group-hover:w-0.5 transition-all" />
                </div>
            </aside>
        </>
    )
}
