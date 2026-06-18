'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft, ExternalLink, Calendar, Tag, Sparkles, Newspaper,
    ZoomIn, ZoomOut, X, BookOpen, Loader2,
} from 'lucide-react'
import { useNewsItem } from '@/lib/hooks/use-news'
import { useAiWordDetails, type AiWordDetails } from '@/lib/hooks/use-dictionary'

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
    Technology:    'bg-blue-500/15 text-blue-300 border-blue-500/30',
    World:         'bg-violet-500/15 text-violet-300 border-violet-500/30',
    Business:      'bg-amber-500/15 text-amber-300 border-amber-500/30',
    Sports:        'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    Health:        'bg-rose-500/15 text-rose-300 border-rose-500/30',
    Science:       'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    Entertainment: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    Automotive:    'bg-orange-500/15 text-orange-300 border-orange-500/30',
    Nation:        'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
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

// ─── Font size ───────────────────────────────────────────────────────────────

const FONT_MIN = 12
const FONT_MAX = 22
const FONT_DEFAULT = 15
const LS_KEY = 'news-article-font-size'

function loadFontSize(): number {
    if (typeof window === 'undefined') return FONT_DEFAULT
    const v = parseInt(localStorage.getItem(LS_KEY) ?? '', 10)
    return Number.isFinite(v) && v >= FONT_MIN && v <= FONT_MAX ? v : FONT_DEFAULT
}

// ─── Word popup ──────────────────────────────────────────────────────────────

const POS_COLORS: Record<string, string> = {
    noun: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    verb: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    adjective: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    adverb: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    phrase: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
}

interface PopupState {
    word: string
    x: number
    y: number
}

function WordPopup({
    popup, data, loading, onClose,
}: {
    popup: PopupState
    data: AiWordDetails | null
    loading: boolean
    onClose: () => void
}) {
    const ref = useRef<HTMLDivElement>(null)

    // Position: prefer above click, fall back below if too close to top
    const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 })
    useEffect(() => {
        if (!ref.current) return
        const { innerWidth, innerHeight } = window
        const popW = ref.current.offsetWidth || 300
        const popH = ref.current.offsetHeight || 200
        let left = popup.x - popW / 2
        left = Math.max(8, Math.min(left, innerWidth - popW - 8))
        const spaceAbove = popup.y - 12
        const top = spaceAbove > popH + 16 ? popup.y - popH - 12 : popup.y + 16
        const clampedTop = Math.max(8, Math.min(top, innerHeight - popH - 8))
        setStyle({ left, top: clampedTop, opacity: 1 })
    }, [popup, data, loading])

    const posKey = (data?.part_of_speech ?? '').toLowerCase()
    const posChip = POS_COLORS[posKey] ?? 'bg-white/10 text-white/50 border-white/20'

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.92, y: 4 }}
            animate={{ opacity: style.opacity === 0 ? 0 : 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 4 }}
            transition={{ duration: 0.15 }}
            className="fixed z-[9999] w-72 sm:w-80 rounded-2xl border border-white/10 bg-[#0d0d1a]/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden"
            style={{ ...style, opacity: undefined }}
        >
            {/* Header */}
            <div className="flex items-start justify-between p-4 pb-2">
                <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold text-white leading-tight truncate">{popup.word}</p>
                    {data?.phonetic && (
                        <p className="text-xs text-white/40 mt-0.5 font-mono">{data.phonetic}</p>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="ml-2 p-1 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition shrink-0"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                </div>
            )}

            {!loading && data && (
                <div className="px-4 pb-4 space-y-3">
                    {/* Part of speech */}
                    {data.part_of_speech && (
                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wide ${posChip}`}>
                            {data.part_of_speech}
                        </span>
                    )}

                    {/* Definition */}
                    <p className="text-sm text-white/80 leading-relaxed">{data.definition}</p>

                    {/* Examples */}
                    {data.examples?.length > 0 && (
                        <div className="space-y-1.5 border-t border-white/5 pt-2.5">
                            {data.examples.slice(0, 2).map((ex, i) => (
                                <p key={i} className="text-xs text-white/45 italic leading-relaxed pl-2 border-l border-white/10">
                                    {ex}
                                </p>
                            ))}
                        </div>
                    )}

                    {/* Difficulty chip */}
                    {data.difficulty && (
                        <p className="text-[10px] text-white/25 uppercase tracking-widest pt-0.5">{data.difficulty}</p>
                    )}
                </div>
            )}

            {!loading && !data && (
                <p className="px-4 pb-4 text-sm text-white/35">No definition found.</p>
            )}
        </motion.div>
    )
}

// ─── Word extraction ─────────────────────────────────────────────────────────

function getWordAtPoint(x: number, y: number): string | null {
    const fn = (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint
    if (!fn) return null
    const range = fn.call(document, x, y)
    if (!range) return null
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) return null
    const text = node.textContent ?? ''
    const offset = range.startOffset
    let start = offset
    while (start > 0 && /[\w'-]/.test(text[start - 1])) start--
    let end = offset
    while (end < text.length && /[\w'-]/.test(text[end])) end++
    return text.slice(start, end).replace(/[^a-zA-Z'-]/g, '').toLowerCase() || null
}

// ─── Reading toolbar ─────────────────────────────────────────────────────────

function ReadingToolbar({
    fontSize, onIncrease, onDecrease, translateActive, onTranslateToggle,
}: {
    fontSize: number
    onIncrease: () => void
    onDecrease: () => void
    translateActive: boolean
    onTranslateToggle: () => void
}) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
            {/* Translate mode toggle */}
            <button
                onClick={onTranslateToggle}
                title={translateActive ? 'Tap mode on — click any word' : 'Enable word tap to translate'}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition font-medium ${
                    translateActive
                        ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300'
                        : 'border-white/10 text-white/40 hover:text-white hover:bg-white/5'
                }`}
            >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tap</span>
            </button>

            <div className="w-px h-4 bg-white/10" />

            {/* Zoom out */}
            <button
                onClick={onDecrease}
                disabled={fontSize <= FONT_MIN}
                title="Decrease font size"
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-25 transition"
            >
                <ZoomOut className="w-4 h-4" />
            </button>

            {/* Font size label */}
            <span className="text-xs text-white/35 w-6 text-center tabular-nums">{fontSize}</span>

            {/* Zoom in */}
            <button
                onClick={onIncrease}
                disabled={fontSize >= FONT_MAX}
                title="Increase font size"
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-25 transition"
            >
                <ZoomIn className="w-4 h-4" />
            </button>
        </div>
    )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ArticleProfilePage() {
    const params = useParams<{ id: string; articleId: string }>()
    const router = useRouter()
    const articleId = parseInt(params.articleId, 10)
    const { data: item, isLoading, error } = useNewsItem(isNaN(articleId) ? null : articleId)
    const lookupWord = useAiWordDetails()

    // Font size
    const [fontSize, setFontSize] = useState(FONT_DEFAULT)
    useEffect(() => { setFontSize(loadFontSize()) }, [])
    const increase = useCallback(() => setFontSize(s => {
        const n = Math.min(s + 1, FONT_MAX); localStorage.setItem(LS_KEY, String(n)); return n
    }), [])
    const decrease = useCallback(() => setFontSize(s => {
        const n = Math.max(s - 1, FONT_MIN); localStorage.setItem(LS_KEY, String(n)); return n
    }), [])

    // Word tap / translate mode
    const [translateActive, setTranslateActive] = useState(false)
    const [popup, setPopup] = useState<PopupState | null>(null)
    const [popupData, setPopupData] = useState<AiWordDetails | null>(null)
    const contentRef = useRef<HTMLDivElement>(null)

    const closePopup = useCallback(() => {
        setPopup(null)
        setPopupData(null)
        lookupWord.reset()
    }, [lookupWord])

    // Update popupData when mutation resolves
    useEffect(() => {
        if (lookupWord.data) setPopupData(lookupWord.data)
    }, [lookupWord.data])

    const handleTextClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!translateActive) return
        const word = getWordAtPoint(e.clientX, e.clientY)
        if (!word || word.length < 2 || word.length > 30) return
        setPopupData(null)
        setPopup({ word, x: e.clientX, y: e.clientY })
        lookupWord.mutate(word)
    }, [translateActive, lookupWord])

    // Dismiss popup on Escape
    useEffect(() => {
        if (!popup) return
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closePopup() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [popup, closePopup])

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
    const initials = sourceName.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
    const avatarBg = sourceAvatarColor(sourceName)
    const categoryChip = DIFF_CHIP[item.category_label] ?? 'bg-white/10 text-white/50 border-white/20'

    return (
        <>
            {/* Backdrop to dismiss popup on outside click */}
            {popup && (
                <div className="fixed inset-0 z-[9998]" onClick={closePopup} />
            )}

            {/* Word definition popup */}
            <AnimatePresence>
                {popup && (
                    <WordPopup
                        popup={popup}
                        data={popupData}
                        loading={lookupWord.isPending}
                        onClose={closePopup}
                    />
                )}
            </AnimatePresence>

            <div className="min-h-screen p-4 sm:p-6 lg:p-8">
                <div className="max-w-2xl mx-auto">
                    {/* Top bar: back + reading toolbar */}
                    <div className="flex items-center justify-between mb-6 gap-3">
                        <motion.button
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            onClick={back}
                            className="flex items-center gap-2 text-white/50 hover:text-white transition text-sm shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back
                        </motion.button>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                            <ReadingToolbar
                                fontSize={fontSize}
                                onIncrease={increase}
                                onDecrease={decrease}
                                translateActive={translateActive}
                                onTranslateToggle={() => { setTranslateActive(v => !v); closePopup() }}
                            />
                        </motion.div>
                    </div>

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
                        <h1
                            className="font-bold text-white leading-snug"
                            style={{ fontSize: Math.round(fontSize * 1.45) + 'px' }}
                        >
                            {item.headline}
                        </h1>

                        {/* Tap-to-translate hint */}
                        <AnimatePresence>
                            {translateActive && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex items-center gap-2 text-xs text-indigo-300/70 px-3 py-2 rounded-lg bg-indigo-500/8 border border-indigo-500/15"
                                >
                                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                                    Tap mode on — click any word in the article to see its definition.
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* AI summary */}
                        {item.summary && (
                            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                                <p className="text-xs text-indigo-300/70 mb-2 flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3" /> AI summary
                                </p>
                                <p className="text-white/75 leading-relaxed" style={{ fontSize: fontSize + 'px' }}>
                                    {item.summary}
                                </p>
                            </div>
                        )}

                        {/* Full article text — clickable when translate mode is on */}
                        {item.content ? (
                            <div className="space-y-3">
                                <p className="text-xs text-white/35 uppercase tracking-wide">Full article</p>
                                <div
                                    ref={contentRef}
                                    onClick={handleTextClick}
                                    className={`text-white/75 leading-relaxed whitespace-pre-line select-text transition-colors ${
                                        translateActive ? 'cursor-pointer' : ''
                                    }`}
                                    style={{ fontSize: fontSize + 'px' }}
                                >
                                    {item.content}
                                </div>
                            </div>
                        ) : item.description && item.description !== item.summary && (
                            <div className="space-y-1.5">
                                <p className="text-xs text-white/35 uppercase tracking-wide">From source</p>
                                <p
                                    ref={contentRef}
                                    onClick={handleTextClick}
                                    className={`text-white/60 leading-relaxed select-text ${
                                        translateActive ? 'cursor-pointer' : ''
                                    }`}
                                    style={{ fontSize: fontSize + 'px' }}
                                >
                                    {item.description}
                                </p>
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
        </>
    )
}
