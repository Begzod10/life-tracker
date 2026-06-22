'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check, Loader2, Newspaper, Search } from 'lucide-react'
import {
    useNewsCategories,
    useSetNewsCategories,
} from '@/lib/hooks/use-news'

export default function NewsPreferencesPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const platformId = params.id

    const categoriesQuery = useNewsCategories()
    const setMutation = useSetNewsCategories()

    // Selection is local until the user hits Save — that way they can toggle
    // freely without firing one PUT per click.
    const [picked, setPicked] = useState<Set<number>>(new Set())

    useEffect(() => {
        if (categoriesQuery.data) {
            setPicked(new Set(categoriesQuery.data.filter(c => c.is_selected).map(c => c.id)))
        }
    }, [categoriesQuery.data])

    const dirty = useMemo(() => {
        if (!categoriesQuery.data) return false
        const initial = new Set(categoriesQuery.data.filter(c => c.is_selected).map(c => c.id))
        if (initial.size !== picked.size) return true
        for (const id of initial) if (!picked.has(id)) return true
        return false
    }, [picked, categoriesQuery.data])

    const toggle = (id: number) => {
        const next = new Set(picked)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setPicked(next)
    }

    const save = async () => {
        await setMutation.mutateAsync(Array.from(picked))
        router.push(`/platform/${platformId}/news`)
    }

    const tier1 = (categoriesQuery.data ?? []).filter(c => c.mode === 'native')
    const tier2 = (categoriesQuery.data ?? []).filter(c => c.mode === 'search')

    return (
        <div className="min-h-screen text-white">
            <header className="sticky top-[52px] sm:top-[68px] z-40 border-b border-white/5 bg-[#070a14]/80 backdrop-blur-xl">
                <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
                    <Link
                        href={`/platform/${platformId}/news`}
                        className="inline-flex items-center gap-1.5 text-sm text-white/60 transition hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Back to News</span>
                    </Link>

                    <button
                        onClick={save}
                        disabled={!dirty || setMutation.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/90 px-3.5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 disabled:shadow-none"
                    >
                        {setMutation.isPending ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Saving…
                            </>
                        ) : (
                            <>
                                <Check className="h-3.5 w-3.5" />
                                Save
                            </>
                        )}
                    </button>
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-6">
                <div className="mb-6 flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-violet-500/20 ring-1 ring-white/10">
                        <Newspaper className="h-4 w-4 text-indigo-200" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                            News categories
                        </h1>
                        <p className="mt-0.5 text-sm text-white/45">
                            Pick what you want in your daily digest. Up to 10 articles per
                            category, fetched at 09:00 Tashkent.
                        </p>
                    </div>
                </div>

                {categoriesQuery.isLoading ? (
                    <div className="grid place-items-center py-20">
                        <Loader2 className="h-5 w-5 animate-spin text-white/30" />
                    </div>
                ) : (
                    <>
                        <SectionHeader label="Direct from providers" hint="Fast, free, broad coverage" />
                        <div className="mb-8 grid gap-2 sm:grid-cols-2">
                            {tier1.map(cat => (
                                <CategoryToggle
                                    key={cat.id}
                                    label={cat.label}
                                    color={cat.color}
                                    selected={picked.has(cat.id)}
                                    onToggle={() => toggle(cat.id)}
                                />
                            ))}
                        </div>

                        {tier2.length > 0 && (
                            <>
                                <SectionHeader
                                    label="Search-based"
                                    hint="Custom queries — slightly noisier results"
                                    icon={<Search className="h-3 w-3" />}
                                />
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {tier2.map(cat => (
                                        <CategoryToggle
                                            key={cat.id}
                                            label={cat.label}
                                            color={cat.color}
                                            selected={picked.has(cat.id)}
                                            onToggle={() => toggle(cat.id)}
                                            variant="search"
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}
            </main>
            {/* Sticky bottom save bar — always visible */}
            {dirty && (
                <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent pointer-events-none">
                    <button
                        onClick={save}
                        disabled={setMutation.isPending}
                        className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-2xl shadow-indigo-500/30 transition hover:bg-indigo-400 disabled:opacity-60"
                    >
                        {setMutation.isPending ? (
                            <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                        ) : (
                            <><Check className="h-4 w-4" />Save changes</>
                        )}
                    </button>
                </div>
            )}
        </div>
    )
}

interface SectionHeaderProps {
    label: string
    hint: string
    icon?: React.ReactNode
}

function SectionHeader({ label, hint, icon }: SectionHeaderProps) {
    return (
        <div className="mb-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5">
                {icon}
                <h2 className="text-xs font-semibold uppercase tracking-wider text-white/70">
                    {label}
                </h2>
            </div>
            <span className="text-xs text-white/30">·</span>
            <span className="text-xs text-white/40">{hint}</span>
            <div className="ml-2 h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
        </div>
    )
}

interface CategoryToggleProps {
    label: string
    color?: string | null
    selected: boolean
    onToggle: () => void
    variant?: 'native' | 'search'
}

function CategoryToggle({ label, color, selected, onToggle, variant = 'native' }: CategoryToggleProps) {
    return (
        <button
            onClick={onToggle}
            className={[
                'group flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition',
                selected
                    ? 'border-indigo-400/30 bg-indigo-500/10 shadow-[0_4px_24px_-12px_rgba(99,102,241,0.5)]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]',
            ].join(' ')}
        >
            <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-white/10"
                style={{
                    backgroundColor: color ? `${color}26` : 'rgba(255,255,255,0.05)',
                }}
                aria-hidden
            >
                <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color || 'rgba(255,255,255,0.4)' }}
                />
            </span>
            <span className="flex-1 text-sm font-medium text-white/90">
                {label}
                {variant === 'search' && (
                    <span className="ml-1.5 align-middle text-[10px] uppercase tracking-wider text-white/30">
                        search
                    </span>
                )}
            </span>
            <span
                className={[
                    'grid h-5 w-5 place-items-center rounded-md border transition',
                    selected
                        ? 'border-indigo-400/40 bg-indigo-400/90 text-white'
                        : 'border-white/15 bg-transparent text-transparent group-hover:border-white/30',
                ].join(' ')}
            >
                <Check className="h-3 w-3" />
            </span>
        </button>
    )
}
