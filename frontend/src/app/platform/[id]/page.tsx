'use client'

import { useParams, useRouter } from 'next/navigation'
import { BookOpen, Target, CalendarDays, Newspaper, Brain, ChevronRight, Clock, Wallet } from 'lucide-react'
import { useDashboardSummary, type DashboardTimeblock } from '@/lib/hooks/use-dashboard'
import { StatusBar, CommandGrid } from '@/components/hud'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function greeting(name: string): string {
    const h = new Date().getHours()
    const time = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
    return `${time}, ${name.split(' ')[0]}`
}

function accuracyColor(pct: number) {
    if (pct >= 80) return 'text-emerald-400'
    if (pct >= 60) return 'text-cyan-400'
    return 'text-red-400'
}

function priorityColor(p: string) {
    if (p === 'high') return 'bg-red-500/20 text-red-300'
    if (p === 'medium') return 'bg-violet-500/20 text-violet-300'
    return 'bg-white/10 text-white/50'
}

function blockCategoryColor(cat: string) {
    const map: Record<string, string> = {
        work: 'bg-blue-500/20 border-blue-500/30',
        learning: 'bg-indigo-500/20 border-indigo-500/30',
        health: 'bg-emerald-500/20 border-emerald-500/30',
        personal: 'bg-purple-500/20 border-purple-500/30',
        social: 'bg-pink-500/20 border-pink-500/30',
    }
    return map[cat] ?? 'bg-white/5 border-white/10'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonCard({ className = '' }: { className?: string }) {
    return <div className={`rounded-xl border border-white/8 bg-white/4 animate-pulse ${className}`} />
}

function SectionHeader({ icon: Icon, label, action, onAction }: {
    icon: React.FC<{ className?: string }>
    label: string
    action?: string
    onAction?: () => void
}) {
    return (
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-white/30" />
                <span className="text-sm font-semibold text-white/70">{label}</span>
            </div>
            {action && onAction && (
                <button
                    onClick={onAction}
                    className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                    {action}
                    <ChevronRight className="w-3 h-3" />
                </button>
            )}
        </div>
    )
}

function TimeblockRow({ block }: { block: DashboardTimeblock }) {
    return (
        <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${blockCategoryColor(block.category)} ${
            block.is_completed ? 'opacity-50' : ''
        }`}>
            {block.color && (
                <div className="w-1 h-6 rounded-full shrink-0" style={{ backgroundColor: block.color }} />
            )}
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${block.is_completed ? 'line-through text-white/40' : 'text-white/85'}`}>
                    {block.title}
                </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-white/35 shrink-0">
                <Clock className="w-3 h-3" />
                {block.start_time}–{block.end_time}
            </div>
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const { data, isLoading } = useDashboardSummary()

    const nav = (path: string) => router.push(`/platform/${params.id}/${path}`)

    if (isLoading) {
        return (
            <div className="min-h-screen px-4 pt-8 pb-24 sm:px-6 max-w-3xl mx-auto space-y-6">
                <SkeletonCard className="h-16" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-20" />)}
                </div>
                <SkeletonCard className="h-48" />
                <SkeletonCard className="h-40" />
                <SkeletonCard className="h-40" />
            </div>
        )
    }

    if (!data) return null

    const { user, exercises, goals, books, today, news, finance } = data
    const todayLabel = new Date(today.date + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric',
    })

    return (
        <div className="min-h-screen text-white">
            <CommandGrid className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6 space-y-6">

                {/* Header */}
                <div>
                    <StatusBar section="Dashboard" chips={[{ label: 'ONLINE', active: true }]} className="mb-2" />
                    <h1 className="text-2xl font-bold text-white">{greeting(user.name)}</h1>
                    <p className="text-sm text-white/35 mt-0.5">{todayLabel}</p>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button
                        onClick={() => nav('learning/exercises')}
                        className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-left hover:bg-white/6 transition-colors"
                    >
                        <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1">Words due</p>
                        <p className={`text-2xl font-bold tabular ${exercises.words_due_today > 0 ? 'text-cyan-400' : 'text-white'}`}>
                            {exercises.words_due_today}
                        </p>
                        <p className="text-[11px] text-white/30 mt-0.5">review today</p>
                    </button>

                    <button
                        onClick={() => nav('learning/exercises')}
                        className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-left hover:bg-white/6 transition-colors"
                    >
                        <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1">Exercises</p>
                        <p className={`text-2xl font-bold ${accuracyColor(exercises.accuracy_7d)}`}>
                            {exercises.accuracy_7d}%
                        </p>
                        <p className="text-[11px] text-white/30 mt-0.5">{exercises.last_7d_total} this week</p>
                    </button>

                    <button
                        onClick={() => nav('timetable')}
                        className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-left hover:bg-white/6 transition-colors"
                    >
                        <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1">Today</p>
                        <p className="text-2xl font-bold text-white">
                            {today.timeblocks_done}/{today.timeblocks_total}
                        </p>
                        <p className="text-[11px] text-white/30 mt-0.5">blocks done</p>
                    </button>

                    <button
                        onClick={() => router.push('/platform?category=goals')}
                        className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-left hover:bg-white/6 transition-colors"
                    >
                        <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1">Goals</p>
                        <p className="text-2xl font-bold text-white">{goals.active}</p>
                        <p className="text-[11px] text-white/30 mt-0.5">{goals.average_completion}% avg</p>
                    </button>
                </div>

                {/* Today's schedule */}
                {today.timeblocks.length > 0 && (
                    <div className="rounded-xl border border-white/8 bg-white/4 p-4">
                        <SectionHeader
                            icon={CalendarDays}
                            label="Today's schedule"
                            action="Full timetable"
                            onAction={() => nav('timetable')}
                        />
                        <div className="space-y-2">
                            {today.timeblocks.slice(0, 5).map(b => (
                                <TimeblockRow key={b.id} block={b} />
                            ))}
                            {today.timeblocks.length > 5 && (
                                <p className="text-xs text-white/25 text-center pt-1">
                                    +{today.timeblocks.length - 5} more
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Learning */}
                <div className="rounded-xl border border-white/8 bg-white/4 p-4">
                    <SectionHeader
                        icon={Brain}
                        label="Learning"
                        action="Go to learning"
                        onAction={() => nav('learning')}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Vocabulary */}
                        <div className="rounded-lg border border-white/8 bg-white/3 p-3">
                            <p className="text-xs text-white/40 mb-2">Vocabulary this week</p>
                            <div className="flex items-end gap-2">
                                <span className={`text-3xl font-bold ${accuracyColor(exercises.accuracy_7d)}`}>
                                    {exercises.accuracy_7d}%
                                </span>
                                <span className="text-xs text-white/30 mb-1">accuracy</span>
                            </div>
                            <p className="text-xs text-white/30 mt-1">
                                {exercises.last_7d_correct}/{exercises.last_7d_total} correct
                                {exercises.words_due_today > 0 && (
                                    <span className="text-cyan-400 ml-2">· {exercises.words_due_today} due</span>
                                )}
                            </p>
                        </div>

                        {/* Current book */}
                        {books.current_book ? (
                            <button
                                onClick={() => nav(`learning/library/${books.current_book!.id}`)}
                                className="rounded-lg border border-white/8 bg-white/3 p-3 text-left hover:bg-white/6 transition-colors"
                            >
                                <p className="text-xs text-white/40 mb-1">Reading now</p>
                                <p className="text-sm font-medium text-white truncate">{books.current_book.title}</p>
                                {books.current_book.author && (
                                    <p className="text-xs text-white/35 truncate">{books.current_book.author}</p>
                                )}
                                <div className="mt-2">
                                    <div className="flex justify-between text-[10px] text-white/30 mb-1">
                                        <span>p. {books.current_book.current_page}</span>
                                        <span>{books.current_book.progress_pct}%</span>
                                    </div>
                                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-cyan-500/60"
                                            style={{ width: `${books.current_book.progress_pct}%` }}
                                        />
                                    </div>
                                </div>
                            </button>
                        ) : (
                            <button
                                onClick={() => nav('learning/library')}
                                className="rounded-lg border border-dashed border-white/10 p-3 text-left hover:bg-white/4 transition-colors"
                            >
                                <BookOpen className="w-5 h-5 text-white/20 mb-1" />
                                <p className="text-xs text-white/30">No book in progress</p>
                                <p className="text-xs text-cyan-400/60 mt-0.5">Open library →</p>
                            </button>
                        )}
                    </div>
                </div>

                {/* Active goals */}
                {goals.top_active.length > 0 && (
                    <div className="rounded-xl border border-white/8 bg-white/4 p-4">
                        <SectionHeader
                            icon={Target}
                            label="Active goals"
                            action="All goals"
                            onAction={() => router.push('/platform?category=goals')}
                        />
                        <div className="space-y-3">
                            {goals.top_active.map(g => (
                                <div key={g.id}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-sm text-white/80 font-medium truncate">{g.title}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md shrink-0 ${priorityColor(g.priority)}`}>
                                                {g.priority}
                                            </span>
                                        </div>
                                        <span className="text-xs font-semibold text-white/60 shrink-0 ml-2">
                                            {g.percentage}%
                                        </span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-cyan-500/50 transition-all"
                                            style={{ width: `${g.percentage}%` }}
                                        />
                                    </div>
                                    <p className="text-[10px] text-white/25 mt-0.5">{g.category}</p>
                                </div>
                            ))}
                        </div>
                        {goals.active > 3 && (
                            <p className="text-xs text-white/25 mt-3">+{goals.active - 3} more active goals</p>
                        )}
                    </div>
                )}

                {/* Finance */}
                {(finance.spent > 0 || finance.budget_allocated > 0) && (
                    <div className="rounded-xl border border-white/8 bg-white/4 p-4">
                        <SectionHeader
                            icon={Wallet}
                            label="This month"
                            action="Finances"
                            onAction={() => nav('finances')}
                        />
                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5">
                                <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Spent</p>
                                <p className="text-base font-bold text-white">
                                    {finance.spent.toLocaleString()}
                                </p>
                            </div>
                            <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5">
                                <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Budget</p>
                                <p className="text-base font-bold text-white/70">
                                    {finance.budget_allocated > 0 ? finance.budget_allocated.toLocaleString() : '—'}
                                </p>
                            </div>
                            <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5">
                                <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Left</p>
                                <p className={`text-base font-bold ${finance.budget_remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {finance.budget_allocated > 0 ? finance.budget_remaining.toLocaleString() : '—'}
                                </p>
                            </div>
                        </div>
                        {finance.budget_allocated > 0 && (
                            <div className="mt-3">
                                <div className="flex justify-between text-[10px] text-white/25 mb-1">
                                    <span>{Math.min(100, Math.round(finance.spent / finance.budget_allocated * 100))}% used</span>
                                    <span>{finance.month}</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${finance.budget_remaining < 0 ? 'bg-red-500/60' : 'bg-emerald-500/50'}`}
                                        style={{ width: `${Math.min(100, Math.round(finance.spent / finance.budget_allocated * 100))}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* News */}
                {news.latest.length > 0 && (
                    <div className="rounded-xl border border-white/8 bg-white/4 p-4">
                        <SectionHeader
                            icon={Newspaper}
                            label="Latest news"
                            action={news.today_count > 0 ? `${news.today_count} today` : 'View all'}
                            onAction={() => nav('news')}
                        />
                        <div className="space-y-2">
                            {news.latest.map(n => (
                                <button
                                    key={n.id}
                                    onClick={() => nav('news')}
                                    className="w-full text-left rounded-lg border border-white/6 bg-white/3 px-3 py-2.5 hover:bg-white/6 transition-colors"
                                >
                                    <p className="text-xs text-white/75 line-clamp-2">{n.headline}</p>
                                    <p className="text-[10px] text-white/25 mt-1">{n.category_label || n.provider}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </CommandGrid>
        </div>
    )
}
