'use client'

import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    ArrowRight,
    BookOpen,
    Brain,
    Check,
    Clock,
    FileText,
    Flame,
    Headphones,
    Keyboard,
    Library as LibraryIcon,
    PenLine,
    Plus,
    Sparkles,
    Target,
    Trophy,
    X,
    Zap,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useDictStats, useRecentWords } from '@/lib/hooks/use-dictionary'
import {
    type PracticeSession,
    useDueCounts,
    usePracticeHistory,
} from '@/lib/hooks/use-practice'
import {
    useBooks,
    useBookSessions,
    useLibraryStats,
    type Book,
} from '@/lib/hooks/use-books'
import { useEssays, type EssayListItem } from '@/lib/hooks/use-essays'
import {
    useExerciseHistory,
    useExerciseStats,
} from '@/lib/hooks/use-exercises'

// ─── Constants ──────────────────────────────────────────────────────────────

const DIFFICULTIES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const DIFF_BAR_COLOR: Record<string, string> = {
    A1: 'bg-green-400',
    A2: 'bg-emerald-400',
    B1: 'bg-blue-400',
    B2: 'bg-violet-400',
    C1: 'bg-purple-400',
    C2: 'bg-rose-400',
}
const DIFF_CHIP_COLOR: Record<string, string> = {
    A1: 'bg-green-500/15 text-green-300 border-green-500/30',
    A2: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    B1: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    B2: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    C1: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    C2: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return ''
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const diff = Math.max(0, Date.now() - then) / 1000
    if (diff < 60) return 'now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    const days = Math.floor(diff / 86400)
    if (days < 7) return `${days}d ago`
    if (days < 30) return `${Math.floor(days / 7)}w ago`
    return new Date(iso).toLocaleDateString()
}

function shortDay(iso: string): string {
    const d = new Date(iso)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)
    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    if (sameDay(d, today)) return 'Today'
    if (sameDay(d, yesterday)) return 'Yesterday'
    return d.toLocaleDateString(undefined, { weekday: 'short' })
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LearningPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const goto = (path: string) => router.push(`/platform/${params.id}/learning${path}`)

    const { data: stats } = useDictStats()
    const { data: dueCounts } = useDueCounts()
    const { data: history = [] } = usePracticeHistory()
    const { data: libraryStats } = useLibraryStats()
    const { data: readingBooks } = useBooks('reading')
    const { data: essays = [] } = useEssays()
    const { data: exerciseStats } = useExerciseStats()
    const { data: recentWords = [] } = useRecentWords(3)
    const { data: recentExercises = [] } = useExerciseHistory(3)

    // Currently reading: most recently opened book in status='reading'.
    const currentBook: Book | undefined = useMemo(() => {
        const list = readingBooks?.items ?? []
        if (list.length === 0) return undefined
        return [...list].sort((a, b) => {
            const ta = a.last_opened_at ? new Date(a.last_opened_at).getTime() : 0
            const tb = b.last_opened_at ? new Date(b.last_opened_at).getTime() : 0
            return tb - ta
        })[0]
    }, [readingBooks])

    const { data: currentBookSessions = [] } = useBookSessions(currentBook?.id)

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 sm:mb-8"
                >
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Learning</h1>
                    <p className="text-sm text-white/50 mt-1">English vocabulary and practice</p>
                </motion.div>

                {/* Top stat row */}
                <StatsRow
                    total={stats?.total ?? 0}
                    reviewed={stats?.reviewed ?? 0}
                    accuracy={stats?.accuracy ?? 0}
                    due={dueCounts?.due ?? 0}
                />

                {/* 3-column panel grid */}
                <div className="mt-4 sm:mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                    <DictionaryPanel
                        total={stats?.total ?? 0}
                        byDifficulty={stats?.by_difficulty ?? {}}
                        recentWords={recentWords}
                        onBrowse={() => goto('/dictionary')}
                    />

                    <PracticePanel
                        due={dueCounts?.due ?? 0}
                        sessions={history}
                        onStart={() => goto('/practice')}
                        onMode={(m) => goto(`/practice?mode=${m}`)}
                    />

                    <ReadingPanel
                        book={currentBook}
                        sessions={currentBookSessions}
                        onPaste={() => goto('/reading')}
                        onAdd={() => goto('/library')}
                    />

                    <WritingPanel
                        essays={essays}
                        onNew={() => goto('/writing')}
                        onQuick={() => goto('/writing')}
                        onDeep={() => goto('/writing')}
                    />

                    <ExercisesPanel
                        stats={exerciseStats}
                        recent={recentExercises}
                        canStart={(stats?.total ?? 0) >= 1}
                        onGenerate={() => goto('/exercises')}
                    />

                    <LibraryPanel
                        stats={libraryStats}
                        books={readingBooks?.items ?? []}
                        onAdd={() => goto('/library')}
                        onOpenBook={(id) => goto(`/library/${id}`)}
                    />
                </div>
            </div>
        </div>
    )
}

// ─── Stats row ──────────────────────────────────────────────────────────────

function StatsRow({
    total,
    reviewed,
    accuracy,
    due,
}: {
    total: number
    reviewed: number
    accuracy: number
    due: number
}) {
    const items = [
        { label: 'Words saved', value: total, icon: BookOpen, color: 'text-blue-300', tint: 'bg-blue-500/10' },
        { label: 'Words reviewed', value: reviewed, icon: Target, color: 'text-emerald-300', tint: 'bg-emerald-500/10' },
        { label: 'Accuracy', value: `${Math.round(accuracy)}%`, icon: Trophy, color: 'text-amber-300', tint: 'bg-amber-500/10' },
        { label: 'Due today', value: due, icon: Clock, color: 'text-rose-300', tint: 'bg-rose-500/10' },
    ]
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {items.map((s, i) => (
                <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                >
                    <Card className="p-3 sm:p-4 bg-white/2.5 border border-white/5">
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md ${s.tint} flex items-center justify-center mb-2`}>
                            <s.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${s.color}`} />
                        </div>
                        <p className="text-xl sm:text-3xl font-bold text-white leading-none">{s.value}</p>
                        <p className="text-[10px] sm:text-xs text-white/50 mt-1.5 uppercase tracking-wider">
                            {s.label}
                        </p>
                    </Card>
                </motion.div>
            ))}
        </div>
    )
}

// ─── Panel shell ────────────────────────────────────────────────────────────

function Panel({
    title,
    subtitle,
    icon: Icon,
    accent,
    children,
}: {
    title: string
    subtitle?: React.ReactNode
    icon: React.ComponentType<{ className?: string }>
    accent: string
    children: React.ReactNode
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <Card className="h-full flex flex-col p-4 sm:p-5 bg-white/2.5 border border-white/5 hover:border-white/10 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wider text-white/40">
                            {title}
                        </p>
                        {subtitle && (
                            <div className="mt-0.5 text-white">{subtitle}</div>
                        )}
                    </div>
                    <div className={`p-2 rounded-lg ${accent} shrink-0`}>
                        <Icon className="w-4 h-4 text-white/80" />
                    </div>
                </div>
                <div className="flex-1 flex flex-col">{children}</div>
            </Card>
        </motion.div>
    )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[10px] uppercase tracking-wider text-white/40 mt-3 mb-2">
            {children}
        </p>
    )
}

function FooterButton({
    children,
    onClick,
    tone = 'default',
}: {
    children: React.ReactNode
    onClick: () => void
    tone?: 'default' | 'primary'
}) {
    const cls =
        tone === 'primary'
            ? 'mt-4 w-full h-10 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2'
            : 'mt-4 w-full h-10 rounded-lg border border-white/10 hover:border-white/20 bg-white/2.5 hover:bg-white/5 text-white/80 text-sm transition-colors flex items-center justify-center gap-2'
    return (
        <button onClick={onClick} className={cls}>
            {children}
        </button>
    )
}

// ─── Dictionary panel ───────────────────────────────────────────────────────

function DictionaryPanel({
    total,
    byDifficulty,
    recentWords,
    onBrowse,
}: {
    total: number
    byDifficulty: Record<string, number>
    recentWords: { id: number; word: string; difficulty: string }[]
    onBrowse: () => void
}) {
    const levels = DIFFICULTIES.filter((d) => byDifficulty[d])
    return (
        <Panel
            title="Dictionary"
            subtitle={
                <span>
                    <span className="text-2xl sm:text-3xl font-bold">{total}</span>{' '}
                    <span className="text-sm text-white/50">words</span>
                </span>
            }
            icon={BookOpen}
            accent="bg-blue-500/15"
        >
            {levels.length > 0 && (
                <>
                    <SectionLabel>By level</SectionLabel>
                    <div className="space-y-2">
                        {levels.map((d) => {
                            const count = byDifficulty[d]
                            const pct = total > 0 ? Math.round((count / total) * 100) : 0
                            return (
                                <div key={d} className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border min-w-[28px] text-center ${DIFF_CHIP_COLOR[d] ?? ''}`}>
                                        {d}
                                    </span>
                                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${DIFF_BAR_COLOR[d] ?? 'bg-white/40'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="text-[11px] text-white/50 tabular-nums shrink-0">
                                        {count} · {pct}%
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}

            {recentWords.length > 0 && (
                <>
                    <SectionLabel>Recent words</SectionLabel>
                    <ul className="space-y-1.5">
                        {recentWords.map((w) => (
                            <li
                                key={w.id}
                                className="flex items-center justify-between gap-2 text-sm"
                            >
                                <span className="text-white/85 italic truncate">{w.word}</span>
                                {w.difficulty && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${DIFF_CHIP_COLOR[w.difficulty] ?? ''}`}>
                                        {w.difficulty}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            )}

            <div className="mt-auto" />
            <FooterButton onClick={onBrowse}>
                Browse all words
                <ArrowRight className="w-3.5 h-3.5" />
            </FooterButton>
        </Panel>
    )
}

// ─── Practice panel ─────────────────────────────────────────────────────────

const PRACTICE_MODES = [
    { id: 'flashcard', label: 'Flashcard', icon: Brain },
    { id: 'quiz', label: 'Quiz', icon: Target },
    { id: 'spelling', label: 'Spelling', icon: Keyboard },
    { id: 'cloze', label: 'Cloze', icon: FileText },
] as const

function PracticePanel({
    due,
    sessions,
    onStart,
    onMode,
}: {
    due: number
    sessions: PracticeSession[]
    onStart: () => void
    onMode: (mode: string) => void
}) {
    const recent = sessions.slice(0, 4)
    return (
        <Panel
            title="Practice"
            subtitle={
                <span>
                    <span className="text-2xl sm:text-3xl font-bold">{due}</span>{' '}
                    <span className="text-sm text-white/50">due today</span>
                </span>
            }
            icon={Brain}
            accent="bg-violet-500/15"
        >
            <SectionLabel>Modes</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
                {PRACTICE_MODES.map((m) => (
                    <button
                        key={m.id}
                        onClick={() => onMode(m.id)}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-white/10 hover:border-violet-500/40 hover:bg-violet-500/5 transition-colors text-left"
                    >
                        <m.icon className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                        <span className="text-sm text-white/85 truncate">{m.label}</span>
                    </button>
                ))}
            </div>

            {recent.length > 0 && (
                <>
                    <SectionLabel>Recent sessions</SectionLabel>
                    <ul className="space-y-2">
                        {recent.map((s) => {
                            const accuracy = s.total_questions > 0
                                ? Math.round((s.correct_answers / s.total_questions) * 100)
                                : 0
                            return (
                                <li key={s.id} className="flex items-center gap-2 text-xs">
                                    <span className="text-white/70 capitalize w-16 shrink-0">
                                        {s.mode}
                                    </span>
                                    <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-emerald-400/70"
                                            style={{ width: `${accuracy}%` }}
                                        />
                                    </div>
                                    <span className="text-white/50 tabular-nums shrink-0">
                                        {s.correct_answers}/{s.total_questions}
                                    </span>
                                    <span className="text-white/30 shrink-0 w-12 text-right">
                                        {timeAgo(s.started_at)}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                </>
            )}

            <div className="mt-auto" />
            <FooterButton onClick={onStart} tone="primary">
                Start practice session
                <Sparkles className="w-3.5 h-3.5" />
            </FooterButton>
        </Panel>
    )
}

// ─── Reading panel ──────────────────────────────────────────────────────────

function ReadingPanel({
    book,
    sessions,
    onPaste,
    onAdd,
}: {
    book?: Book
    sessions: { id: number; started_at: string; pages_read: number }[]
    onPaste: () => void
    onAdd: () => void
}) {
    if (!book) {
        return (
            <Panel
                title="Reading"
                subtitle={<span className="text-sm text-white/70">No active book</span>}
                icon={FileText}
                accent="bg-emerald-500/15"
            >
                <p className="text-sm text-white/50 mt-2">
                    Upload a PDF to start mining vocabulary as you read.
                </p>
                <div className="mt-auto" />
                <FooterButton onClick={onAdd}>
                    <Plus className="w-3.5 h-3.5" />
                    Add a book
                </FooterButton>
            </Panel>
        )
    }

    const pct = book.progress_percent
    const recent = [...sessions]
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
        .slice(0, 3)

    return (
        <Panel
            title="Reading"
            subtitle={<span className="text-sm text-white/70">Currently reading</span>}
            icon={FileText}
            accent="bg-emerald-500/15"
        >
            <div className="flex items-center gap-3 sm:gap-4 mt-1">
                <ProgressRing value={pct} />
                <div className="min-w-0">
                    <p className="font-semibold text-white truncate italic">{book.title}</p>
                    {book.author && (
                        <p className="text-xs text-white/50 truncate">{book.author}</p>
                    )}
                    <p className="text-xs text-white/50 mt-1">
                        {book.current_page} of {book.total_pages || '—'} pages
                    </p>
                    <p className="inline-flex items-center gap-1 mt-1 text-[11px] text-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Reading now
                    </p>
                </div>
            </div>

            {recent.length > 0 && (
                <>
                    <SectionLabel>Recent sessions</SectionLabel>
                    <ul className="space-y-1.5">
                        {recent.map((s) => (
                            <li
                                key={s.id}
                                className="flex items-center justify-between text-xs"
                            >
                                <span className="text-white/70">{shortDay(s.started_at)}</span>
                                <span className="text-white/50 tabular-nums">
                                    {s.pages_read} pages
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {book.highlight_count > 0 && (
                <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-white/10 bg-white/5 self-start">
                    <span className="text-[11px] text-white/50">Words mined</span>
                    <span className="text-[11px] font-semibold text-white/85 tabular-nums">
                        {book.highlight_count}
                    </span>
                </div>
            )}

            <div className="mt-auto" />
            <FooterButton onClick={onPaste}>
                Paste text to mine vocab
                <ArrowRight className="w-3.5 h-3.5" />
            </FooterButton>
        </Panel>
    )
}

function ProgressRing({ value }: { value: number }) {
    const size = 64
    const stroke = 6
    const radius = (size - stroke) / 2
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={stroke}
                    fill="transparent"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#34d399"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    fill="transparent"
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">
                {Math.round(value)}%
            </div>
        </div>
    )
}

// ─── Writing panel ──────────────────────────────────────────────────────────

function WritingPanel({
    essays,
    onNew,
    onQuick,
    onDeep,
}: {
    essays: EssayListItem[]
    onNew: () => void
    onQuick: () => void
    onDeep: () => void
}) {
    const past = essays.filter((e) => e.deep_score != null || e.quick_score != null).slice(0, 3)
    return (
        <Panel
            title="Writing"
            subtitle={
                <p className="text-base sm:text-lg font-semibold text-white leading-snug">
                    AI-graded essays
                </p>
            }
            icon={PenLine}
            accent="bg-amber-500/15"
        >
            <p className="text-xs text-white/50 leading-relaxed">
                Quick check or deep review with band score feedback.
            </p>

            <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                    onClick={onQuick}
                    className="px-3 py-1.5 rounded-md border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/5 text-xs text-white/85 transition-colors"
                >
                    Quick check
                </button>
                <button
                    onClick={onDeep}
                    className="px-3 py-1.5 rounded-md border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/5 text-xs text-white/85 transition-colors"
                >
                    Deep review
                </button>
            </div>

            {past.length > 0 && (
                <>
                    <SectionLabel>Past essays</SectionLabel>
                    <ul className="space-y-1.5">
                        {past.map((e) => {
                            const score = e.deep_score ?? e.quick_score
                            const scoreLabel = score != null ? scoreToBand(score) : '—'
                            return (
                                <li
                                    key={e.id}
                                    className="flex items-center justify-between gap-2 text-xs"
                                >
                                    <div className="min-w-0">
                                        <p className="text-white/85 truncate">
                                            {e.title || 'Untitled essay'}
                                        </p>
                                        <p className="text-[11px] text-white/40">
                                            {e.level} · {timeAgo(e.updated_at ?? e.created_at)}
                                        </p>
                                    </div>
                                    <span className="text-amber-300 font-semibold tabular-nums shrink-0">
                                        {scoreLabel}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                </>
            )}

            <div className="mt-auto" />
            <FooterButton onClick={onNew} tone="primary">
                Submit new essay
                <Sparkles className="w-3.5 h-3.5" />
            </FooterButton>
        </Panel>
    )
}

/**
 * Essay scores are stored as 0-100 (per the schema). IELTS-style band scores
 * run 0.0–9.0 in half steps, so this just rescales for display when the user
 * is working toward a band — keeps the number in the familiar range without
 * inventing extra fields.
 */
function scoreToBand(score: number): string {
    const band = Math.round((score / 100) * 18) / 2
    return band.toFixed(1)
}

// ─── Exercises panel ────────────────────────────────────────────────────────

function ExercisesPanel({
    stats,
    recent,
    canStart,
    onGenerate,
}: {
    stats?: { total: number; correct: number; accuracy: number; last_7d_total: number }
    recent: { id: number; word: string | null; sentence: string; is_correct: boolean }[]
    canStart: boolean
    onGenerate: () => void
}) {
    return (
        <Panel
            title="Exercises"
            subtitle={
                <p className="text-base sm:text-lg font-semibold text-white leading-snug">
                    Write sentences
                </p>
            }
            icon={Sparkles}
            accent="bg-rose-500/15"
        >
            <p className="text-xs text-white/50 leading-relaxed">
                Practice using your dictionary words in real context.
            </p>

            {stats && stats.total > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                    <Stat label="Sentences" value={stats.total} />
                    <Stat label="Accuracy" value={`${stats.accuracy}%`} />
                    <Stat label="Last 7d" value={stats.last_7d_total} />
                </div>
            )}

            {recent.length > 0 && (
                <>
                    <SectionLabel>Recent attempts</SectionLabel>
                    <ul className="space-y-1.5">
                        {recent.map((r) => (
                            <li key={r.id} className="flex items-start gap-2 text-xs">
                                <span className={`mt-0.5 shrink-0 ${r.is_correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                                    {r.is_correct ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                                </span>
                                <div className="min-w-0">
                                    {r.word && (
                                        <span className="text-white/70 font-medium mr-1">
                                            {r.word}:
                                        </span>
                                    )}
                                    <span className="text-white/60 italic">
                                        “{r.sentence.length > 80 ? r.sentence.slice(0, 77) + '…' : r.sentence}”
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            <div className="mt-auto" />
            <FooterButton onClick={onGenerate} tone="primary">
                {canStart ? (
                    <>
                        Generate new exercises
                        <Sparkles className="w-3.5 h-3.5" />
                    </>
                ) : (
                    'Add words to start'
                )}
            </FooterButton>
        </Panel>
    )
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-md border border-white/10 bg-white/2.5 px-2 py-2">
            <p className="text-base sm:text-lg font-semibold text-white tabular-nums leading-tight">
                {value}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-white/40 mt-0.5">{label}</p>
        </div>
    )
}

// ─── Library panel ──────────────────────────────────────────────────────────

function LibraryPanel({
    stats,
    books,
    onAdd,
    onOpenBook,
}: {
    stats?: { total_books: number; by_status: Record<string, number>; pages_last_30d: number }
    books: Book[]
    onAdd: () => void
    onOpenBook: (id: number) => void
}) {
    const totalBooks = stats?.total_books ?? books.length
    const wordsMined = useMemo(
        () => books.reduce((acc, b) => acc + (b.highlight_count ?? 0), 0),
        [books],
    )
    const top = books.slice(0, 3)

    return (
        <Panel
            title="Library"
            subtitle={
                <span>
                    <span className="text-2xl sm:text-3xl font-bold">{totalBooks}</span>{' '}
                    <span className="text-sm text-white/50">
                        book{totalBooks === 1 ? '' : 's'}
                    </span>
                </span>
            }
            icon={LibraryIcon}
            accent="bg-violet-500/15"
        >
            {top.length > 0 ? (
                <>
                    <SectionLabel>Your books</SectionLabel>
                    <ul className="space-y-2">
                        {top.map((b) => (
                            <li key={b.id}>
                                <button
                                    onClick={() => onOpenBook(b.id)}
                                    className="w-full text-left p-2 -mx-2 rounded-md hover:bg-white/3 transition-colors"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm text-white/90 truncate flex-1">
                                            {b.title}
                                        </p>
                                        {b.status === 'done' ? (
                                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                        ) : (
                                            <span className="text-[11px] text-white/40 tabular-nums shrink-0">
                                                {b.progress_percent}%
                                            </span>
                                        )}
                                    </div>
                                    {b.author && (
                                        <p className="text-[11px] text-white/50 truncate">
                                            {b.author}
                                        </p>
                                    )}
                                    <div className="mt-1 flex items-center gap-2">
                                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-violet-400/80"
                                                style={{ width: `${b.progress_percent}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] text-white/40 tabular-nums shrink-0">
                                            {b.current_page}/{b.total_pages || '—'}
                                        </span>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            ) : (
                <p className="text-sm text-white/50 mt-2">
                    Upload PDFs to start building your reading library.
                </p>
            )}

            {(wordsMined > 0 || (stats?.pages_last_30d ?? 0) > 0) && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                    {wordsMined > 0 && <Stat label="Words mined" value={wordsMined} />}
                    {(stats?.pages_last_30d ?? 0) > 0 && (
                        <Stat label="Pages · 30d" value={stats!.pages_last_30d} />
                    )}
                </div>
            )}

            <div className="mt-auto" />
            <FooterButton onClick={onAdd}>
                <Plus className="w-3.5 h-3.5" />
                Add new book
            </FooterButton>
        </Panel>
    )
}
