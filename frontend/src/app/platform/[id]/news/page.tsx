'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Newspaper,
    RefreshCw,
    Settings as SettingsIcon,
    Sparkles,
} from 'lucide-react'
import {
    useNewsCategories,
    useNewsDates,
    useNewsFetch,
    useNewsItems,
    type NewsItem,
} from '@/lib/hooks/use-news'

// ─── Date helpers ───────────────────────────────────────────────────────────

function tashkentToday(): string {
    // Pipeline stamps `date` as Tashkent-local (UTC+5). Match that for the
    // default so "Today" on the picker actually maps to a day with content.
    const now = new Date(Date.now() + 5 * 60 * 60 * 1000)
    return now.toISOString().slice(0, 10)
}

function shiftDay(iso: string, deltaDays: number): string {
    const d = new Date(iso + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + deltaDays)
    return d.toISOString().slice(0, 10)
}

function prettyDate(iso: string): string {
    const today = tashkentToday()
    const yesterday = shiftDay(today, -1)
    if (iso === today) return 'Today'
    if (iso === yesterday) return 'Yesterday'
    const d = new Date(iso + 'T00:00:00Z')
    return d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
    })
}

function relativeTime(iso?: string | null): string {
    if (!iso) return ''
    const t = new Date(iso).getTime()
    if (Number.isNaN(t)) return ''
    const diff = Math.max(0, Date.now() - t) / 1000
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    const days = Math.floor(diff / 86400)
    return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString()
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NewsPage() {
    const params = useParams<{ id: string }>()
    const platformId = params.id

    const [date, setDate] = useState(tashkentToday())
    const [activeSlug, setActiveSlug] = useState<string | null>(null)

    const categoriesQuery = useNewsCategories()
    const itemsQuery = useNewsItems(date)
    const datesQuery = useNewsDates()
    const fetchMutation = useNewsFetch()

    const today = tashkentToday()
    const selectedCategories = (categoriesQuery.data ?? []).filter(c => c.is_selected)
    const items = itemsQuery.data ?? []
    const filteredItems = activeSlug
        ? items.filter(i => i.category_slug === activeSlug)
        : items

    const itemsByCategory = useMemo(() => {
        const map = new Map<string, NewsItem[]>()
        for (const item of filteredItems) {
            const bucket = map.get(item.category_slug) ?? []
            bucket.push(item)
            map.set(item.category_slug, bucket)
        }
        return map
    }, [filteredItems])

    const datesWithContent = new Set(datesQuery.data?.dates ?? [])

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black text-white">
            {/* ─── Header ───────────────────────────────────────────────── */}
            <header className="sticky top-0 z-20 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
                <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-violet-500/20 ring-1 ring-white/10">
                                <Newspaper className="h-4 w-4 text-indigo-200" />
                            </div>
                            <div>
                                <h1 className="text-base font-semibold tracking-tight sm:text-lg">News</h1>
                                <p className="hidden text-xs text-white/40 sm:block">
                                    AI-summarized headlines for your categories
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => fetchMutation.mutate(date)}
                                disabled={fetchMutation.isPending}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50 sm:px-3"
                                title="Refetch news for this date"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${fetchMutation.isPending ? 'animate-spin' : ''}`} />
                                <span className="hidden sm:inline">Refresh</span>
                            </button>
                            <Link
                                href={`/platform/${platformId}/news/preferences`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white sm:px-3"
                            >
                                <SettingsIcon className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Categories</span>
                            </Link>
                        </div>
                    </div>

                    {/* Date selector */}
                    <div className="mt-3 flex items-center gap-2">
                        <button
                            onClick={() => setDate(shiftDay(date, -1))}
                            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
                            aria-label="Previous day"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
                            <Calendar className="h-3.5 w-3.5 text-white/40" />
                            <input
                                type="date"
                                value={date}
                                max={today}
                                onChange={e => setDate(e.target.value)}
                                className="flex-1 bg-transparent text-sm text-white/90 focus:outline-none [color-scheme:dark]"
                            />
                            <span className="hidden text-xs text-white/40 sm:inline">
                                {prettyDate(date)}
                            </span>
                            {datesWithContent.has(date) ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                                    <span className="h-1 w-1 rounded-full bg-emerald-400" />
                                    in log
                                </span>
                            ) : null}
                        </div>
                        <button
                            onClick={() => setDate(shiftDay(date, 1))}
                            disabled={date >= today}
                            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                            aria-label="Next day"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6">
                {/* ─── Category chips ────────────────────────────────────── */}
                {selectedCategories.length > 0 && (
                    <div className="mb-5 flex flex-wrap gap-2">
                        <CategoryChip
                            label="All"
                            count={items.length}
                            active={activeSlug === null}
                            onClick={() => setActiveSlug(null)}
                        />
                        {selectedCategories.map(cat => (
                            <CategoryChip
                                key={cat.id}
                                label={cat.label}
                                color={cat.color}
                                count={items.filter(i => i.category_slug === cat.slug).length}
                                active={activeSlug === cat.slug}
                                onClick={() => setActiveSlug(activeSlug === cat.slug ? null : cat.slug)}
                            />
                        ))}
                    </div>
                )}

                {/* ─── Empty / loading / content ─────────────────────────── */}
                {categoriesQuery.isLoading || itemsQuery.isLoading ? (
                    <SkeletonGrid />
                ) : selectedCategories.length === 0 ? (
                    <EmptyNoCategories platformId={platformId} />
                ) : filteredItems.length === 0 ? (
                    <EmptyNoArticles
                        date={date}
                        onTrigger={() => fetchMutation.mutate(date)}
                        pending={fetchMutation.isPending}
                    />
                ) : (
                    <>
                        {/* When no chip is active, group by category for visual hierarchy.
                            When a chip is active, render flat — the user already drilled in. */}
                        {activeSlug === null ? (
                            <div className="space-y-8">
                                {selectedCategories.map(cat => {
                                    const bucket = itemsByCategory.get(cat.slug) ?? []
                                    if (!bucket.length) return null
                                    return (
                                        <section key={cat.id}>
                                            <SectionHeader label={cat.label} color={cat.color} count={bucket.length} />
                                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                                {bucket.map(item => (
                                                    <ArticleCard key={item.id} item={item} platformId={platformId} />
                                                ))}
                                            </div>
                                        </section>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {filteredItems.map(item => (
                                    <ArticleCard key={item.id} item={item} platformId={platformId} />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    )
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

interface CategoryChipProps {
    label: string
    count: number
    active: boolean
    color?: string | null
    onClick: () => void
}

function CategoryChip({ label, count, active, color, onClick }: CategoryChipProps) {
    return (
        <button
            onClick={onClick}
            className={[
                'group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                active
                    ? 'border-white/20 bg-white/15 text-white shadow-[0_4px_24px_-8px_rgba(255,255,255,0.18)]'
                    : 'border-white/10 bg-white/5 text-white/60 hover:border-white/15 hover:bg-white/8 hover:text-white/90',
            ].join(' ')}
        >
            {color && (
                <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden
                />
            )}
            <span>{label}</span>
            {count > 0 && (
                <span
                    className={[
                        'ml-0.5 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums',
                        active ? 'bg-white/10 text-white/80' : 'bg-white/5 text-white/40',
                    ].join(' ')}
                >
                    {count}
                </span>
            )}
        </button>
    )
}

interface SectionHeaderProps {
    label: string
    color?: string | null
    count: number
}

function SectionHeader({ label, color, count }: SectionHeaderProps) {
    return (
        <div className="mb-3 flex items-center gap-2">
            <div className="flex items-center gap-2">
                {color && (
                    <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: color }}
                        aria-hidden
                    />
                )}
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white/80">
                    {label}
                </h2>
            </div>
            <span className="text-xs tabular-nums text-white/30">{count}</span>
            <div className="ml-2 h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
        </div>
    )
}

interface ArticleCardProps {
    item: NewsItem
    platformId: string
}

// Deterministic pastel background for source avatar based on name characters.
function sourceAvatarColor(name: string): string {
    const colors = [
        'bg-indigo-500/70', 'bg-violet-500/70', 'bg-blue-500/70',
        'bg-emerald-500/70', 'bg-amber-500/70', 'bg-rose-500/70',
        'bg-cyan-500/70', 'bg-fuchsia-500/70', 'bg-teal-500/70',
    ]
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
    return colors[h % colors.length]
}

function ArticleCard({ item, platformId }: ArticleCardProps) {
    const sourceName = item.source_name || item.provider || 'News'
    const initials = sourceName.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
    const avatarBg = sourceAvatarColor(sourceName)

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition hover:border-white/15 hover:bg-white/[0.05]"
        >
            {/* Source profile header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarBg}`}>
                    {initials}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white/90">{sourceName}</p>
                    {item.published_at && (
                        <p className="text-[10px] text-white/35">{relativeTime(item.published_at)}</p>
                    )}
                </div>
                {/* Direct external link — bypasses profile page */}
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open original article"
                    className="shrink-0 rounded-lg p-1.5 text-white/35 transition hover:bg-white/10 hover:text-white/80"
                    onClick={e => e.stopPropagation()}
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                </a>
            </div>

            {/* Clicking image/title/summary goes to the in-app profile page */}
            <Link href={`/platform/${platformId}/news/${item.id}`} className="group block">
                {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={item.image_url}
                        alt=""
                        loading="lazy"
                        className="h-40 w-full object-cover opacity-90 transition group-hover:opacity-100"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                ) : (
                    <div className="grid h-32 w-full place-items-center bg-gradient-to-br from-white/[0.04] to-transparent">
                        <Newspaper className="h-7 w-7 text-white/12" />
                    </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                    <h3 className="line-clamp-3 text-sm font-semibold leading-snug text-white/95 group-hover:text-white transition">
                        {item.headline}
                    </h3>
                    {item.summary && (
                        <p className="line-clamp-2 text-xs leading-relaxed text-white/50">
                            <Sparkles className="mr-1 inline h-3 w-3 text-indigo-300/60" />
                            {item.summary}
                        </p>
                    )}
                    <p className="mt-auto pt-3 text-[11px] font-medium text-indigo-400/70 transition group-hover:text-indigo-300">
                        View article →
                    </p>
                </div>
            </Link>
        </motion.div>
    )
}

interface EmptyNoCategoriesProps {
    platformId: string
}

function EmptyNoCategories({ platformId }: EmptyNoCategoriesProps) {
    return (
        <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
            <Newspaper className="mb-3 h-7 w-7 text-white/20" />
            <h2 className="text-base font-semibold text-white/90">Pick your categories</h2>
            <p className="mt-1 max-w-xs text-sm text-white/45">
                You haven&apos;t subscribed to any news categories yet. Choose what you
                want to see in your daily digest.
            </p>
            <Link
                href={`/platform/${platformId}/news/preferences`}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/90 px-3.5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500"
            >
                <SettingsIcon className="h-3.5 w-3.5" />
                Choose categories
            </Link>
        </div>
    )
}

interface EmptyNoArticlesProps {
    date: string
    onTrigger: () => void
    pending: boolean
}

function EmptyNoArticles({ date, onTrigger, pending }: EmptyNoArticlesProps) {
    return (
        <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
            <Calendar className="mb-3 h-7 w-7 text-white/20" />
            <h2 className="text-base font-semibold text-white/90">
                No news for {prettyDate(date)} yet
            </h2>
            <p className="mt-1 max-w-xs text-sm text-white/45">
                The daily fetch runs at 09:00 Tashkent. You can also trigger it now.
            </p>
            <button
                onClick={onTrigger}
                disabled={pending}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-50"
            >
                <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
                {pending ? 'Fetching…' : 'Fetch now'}
            </button>
        </div>
    )
}

function SkeletonGrid() {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
                <div
                    key={i}
                    className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
                >
                    <div className="h-40 w-full animate-pulse bg-white/5" />
                    <div className="space-y-2 p-4">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
                        <div className="h-2 w-full animate-pulse rounded bg-white/5" />
                        <div className="h-2 w-5/6 animate-pulse rounded bg-white/5" />
                    </div>
                </div>
            ))}
        </div>
    )
}
