'use client'

import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, ExternalLink, Calendar, Tag, Sparkles, Newspaper } from 'lucide-react'
import { useNewsItem } from '@/lib/hooks/use-news'

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
}

function relativeTime(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
}

const DIFF_CHIP: Record<string, string> = {
    Technology: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    World:      'bg-violet-500/15 text-violet-300 border-violet-500/30',
    Business:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
    Sports:     'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    Health:     'bg-rose-500/15 text-rose-300 border-rose-500/30',
    Science:    'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    Entertainment: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    Automotive: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    Nation:     'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
}

function sourceAvatarColor(name: string) {
    const colors = [
        'bg-indigo-500', 'bg-violet-500', 'bg-blue-500',
        'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
        'bg-cyan-500', 'bg-fuchsia-500', 'bg-teal-500',
    ]
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
    return colors[h % colors.length]
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ArticleProfilePage() {
    const params = useParams<{ id: string; articleId: string }>()
    const router = useRouter()
    const articleId = parseInt(params.articleId, 10)
    const { data: item, isLoading, error } = useNewsItem(isNaN(articleId) ? null : articleId)

    const back = () => router.back()

    if (isLoading) {
        return (
            <div className="min-h-screen p-4 sm:p-6 lg:p-8">
                <div className="max-w-2xl mx-auto space-y-4">
                    <div className="h-8 w-32 bg-white/5 rounded-lg animate-pulse" />
                    <div className="h-64 w-full bg-white/5 rounded-2xl animate-pulse" />
                    <div className="h-6 w-3/4 bg-white/5 rounded-lg animate-pulse" />
                    <div className="h-4 w-full bg-white/5 rounded-lg animate-pulse" />
                    <div className="h-4 w-5/6 bg-white/5 rounded-lg animate-pulse" />
                </div>
            </div>
        )
    }

    if (error || !item) {
        return (
            <div className="min-h-screen p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center gap-4">
                <Newspaper className="w-10 h-10 text-white/20" />
                <p className="text-white/50">Article not found.</p>
                <button onClick={back} className="text-sm text-indigo-400 hover:text-indigo-300 transition">
                    ← Go back
                </button>
            </div>
        )
    }

    const sourceName = item.source_name || item.provider || 'News'
    const initials = sourceName.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
    const avatarBg = sourceAvatarColor(sourceName)
    const categoryChip = DIFF_CHIP[item.category_label] ?? 'bg-white/10 text-white/50 border-white/20'

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-2xl mx-auto">
                {/* Back button */}
                <motion.button
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={back}
                    className="flex items-center gap-2 text-white/50 hover:text-white transition mb-6 text-sm"
                >
                    <ArrowLeft className="w-4 h-4" /> Back
                </motion.button>

                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                >
                    {/* Source profile card */}
                    <div className="flex items-center gap-4 p-4 rounded-2xl border border-white/10 bg-white/[0.03]">
                        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${avatarBg}`}>
                            {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-base font-bold text-white">{sourceName}</p>
                            {item.published_at && (
                                <p className="text-xs text-white/40 mt-0.5 flex items-center gap-1.5">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(item.published_at)}
                                    <span className="text-white/25">·</span>
                                    {relativeTime(item.published_at)}
                                </p>
                            )}
                        </div>
                        <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border font-medium ${categoryChip}`}>
                            <Tag className="w-3 h-3 inline mr-1" />
                            {item.category_label}
                        </span>
                    </div>

                    {/* Hero image */}
                    {item.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={item.image_url}
                            alt=""
                            className="w-full h-64 sm:h-80 object-cover rounded-2xl border border-white/10"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                    )}

                    {/* Headline */}
                    <h1 className="text-xl sm:text-2xl font-bold text-white leading-snug">
                        {item.headline}
                    </h1>

                    {/* AI summary */}
                    {item.summary && (
                        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                            <p className="text-xs text-indigo-300/70 mb-2 flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3" /> AI summary
                            </p>
                            <p className="text-sm text-white/75 leading-relaxed">{item.summary}</p>
                        </div>
                    )}

                    {/* Full article text */}
                    {item.content ? (
                        <div className="space-y-3">
                            <p className="text-xs text-white/35 uppercase tracking-wide">Full article</p>
                            <div className="text-sm text-white/75 leading-relaxed whitespace-pre-line">
                                {item.content}
                            </div>
                        </div>
                    ) : item.description && item.description !== item.summary && (
                        <div className="space-y-1.5">
                            <p className="text-xs text-white/35 uppercase tracking-wide">From source</p>
                            <p className="text-sm text-white/60 leading-relaxed">{item.description}</p>
                        </div>
                    )}

                    {/* Read original article CTA */}
                    <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition shadow-lg shadow-indigo-500/20"
                    >
                        Read original article
                        <ExternalLink className="w-4 h-4" />
                    </a>

                    {/* Meta footer */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-white/30 pt-2 border-t border-white/5">
                        <span>Provider: <span className="text-white/50">{item.provider}</span></span>
                        {item.date && (
                            <span>Date: <span className="text-white/50">{item.date as string}</span></span>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    )
}
