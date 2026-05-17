'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft, ChevronLeft, ChevronRight, Loader2, Plus, Sparkles, X,
    BookOpen, Highlighter, Bookmark, ZoomIn, ZoomOut, Trash2, ListChecks,
    MapPin, Languages, RefreshCw,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField, SelectInput, TextareaInput } from '@/components/modals/form-components'
import { API_ENDPOINTS } from '@/lib/api/endpoints'
import { fetchWithAuth } from '@/lib/api/fetch-with-auth'
import {
    useBook, useBookUpdate, useBookHighlights, useHighlightCreate, useHighlightDelete, useHighlightRefreshDefinition,
    type BookHighlight,
} from '@/lib/hooks/use-books'
import {
    useFolders, useModules, useFolderCreate, useModuleCreate,
    type DictionaryFolder, type DictionaryModule,
} from '@/lib/hooks/use-dictionary'

// react-pdf has heavy client-only deps (DOMMatrix, etc.) — only load on the client.
const PdfDocument = dynamic(() => import('react-pdf').then(m => m.Document), { ssr: false })
const PdfPage = dynamic(() => import('react-pdf').then(m => m.Page), { ssr: false })

// One-shot worker config + CSS imports. We pull this in once when the page mounts.
// The query string on workerSrc is tied to pdf.js's API version so that any
// caching layer (browser, Cloudflare, CDN) is forced to fetch a fresh worker
// when we bump pdfjs-dist — pdf.js does an exact-string version handshake
// between the main thread and the worker and refuses to load on mismatch.
let pdfJsReady: Promise<void> | null = null
async function ensurePdfJs() {
    if (pdfJsReady) return pdfJsReady
    pdfJsReady = (async () => {
        const { pdfjs } = await import('react-pdf')
        pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjs.version}`
        await Promise.all([
            // @ts-ignore — CSS modules don't have types
            import('react-pdf/dist/Page/AnnotationLayer.css'),
            // @ts-ignore
            import('react-pdf/dist/Page/TextLayer.css'),
        ])
    })()
    return pdfJsReady
}

interface Selection {
    text: string
    rect: DOMRect | null
}

// ─── Text-layer matching helper ────────────────────────────────────────────
// pdf.js renders one <span> per visual text run (often an entire line). For
// features that need to highlight or annotate a saved string of text, we
// build a flat normalized concatenation of all spans with each span's
// [start, end] offset recorded, then locate the target substring inside the
// flat string and map the match range back onto the spans it covers.
// Returns the matching spans in document order, or [] if no match.
function spansForText(layer: Element, target: string): HTMLElement[] {
    // NFKD decomposes ligatures (ﬁ → fi, ﬂ → fl, ﬀ → ff…) and stripped
    // diacritics, so a saved word always reduces to its plain ASCII form
    // even when the PDF source encodes glyphs with combining marks or
    // typographic ligatures. Without this, "Bogues" can fail to match
    // because the PDF text layer carries an unexpected codepoint.
    const norm = (s: string) =>
        (s || '')
            .normalize('NFKD')
            .replace(/\s+/g, ' ')
            .toLowerCase()
    const needle = norm(target).trim()
    if (needle.length < 2) return []

    const spans = Array.from(layer.querySelectorAll('span')) as HTMLElement[]
    let flat = ''
    const ranges: { span: HTMLElement; start: number; end: number }[] = []
    for (const s of spans) {
        const text = norm(s.textContent || '')
        if (!text) continue
        const start = flat.length
        flat += text
        ranges.push({ span: s, start, end: flat.length })
        flat += ' '
    }

    let idx = flat.indexOf(needle)
    let matchLen = needle.length
    if (idx < 0) {
        // pdf.js often puts punctuation in its own span ("AGILITY" + ","),
        // so the inter-span space separator gives us "agility , " in flat
        // and the literal needle "agility," misses. Strip trailing
        // punctuation from the needle and retry.
        const trimmed = needle.replace(/[\p{P}\p{S}]+$/u, '').trim()
        if (trimmed.length >= 2 && trimmed !== needle) {
            idx = flat.indexOf(trimmed)
            matchLen = trimmed.length
        }
    }
    if (idx < 0) {
        // Word-boundary regex search — picks up cases where the literal
        // indexOf misses (e.g. "Bogues" surrounded by punctuation that
        // landed in adjacent spans without a clean lower-cased match).
        try {
            const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const re = new RegExp(`(?:^|\\W)${escaped}(?:\\W|$)`, 'i')
            const m = re.exec(flat)
            if (m && m.index >= 0) {
                idx = m.index + (m[0].startsWith(needle) ? 0 : m[0].indexOf(needle))
                matchLen = needle.length
            }
        } catch {/* regex pathologies fall through to head match */}
    }
    if (idx < 0) {
        const head = needle.slice(0, Math.min(40, needle.length))
        idx = flat.indexOf(head)
        matchLen = head.length
    }
    if (idx < 0) return []
    const matchEnd = idx + matchLen
    return ranges.filter(r => r.end > idx && r.start < matchEnd).map(r => r.span)
}

// Return the exact pixel rectangle of `target` inside the given spans.
// pdf.js often packs a whole line into one <span>, so a per-span bounding
// rect would point at the left edge of the line rather than the actual
// word. We scan each span's raw text case-insensitively and build a Range
// for the matched offset so the rect lands tight against the word itself.
// Falls back to the first span's bbox if no in-span substring match works.
function rectForText(spans: HTMLElement[], target: string): DOMRect | null {
    if (spans.length === 0) return null
    const normGlyph = (s: string) => (s || '').normalize('NFKD').toLowerCase()
    const needle = normGlyph(target)
    for (const span of spans) {
        const rawText = span.textContent || ''
        const normText = normGlyph(rawText)
        const idx = normText.indexOf(needle)
        if (idx < 0) continue
        // Range needs offsets in the *raw* text node, not the normalized
        // form. NFKD almost always produces the same length as the source
        // for plain ASCII; when a ligature expands (ﬁ → fi) the offset
        // gets a small drift but Math.min() against nodeLen keeps it safe.
        const node = span.firstChild
        if (!node || node.nodeType !== Node.TEXT_NODE) continue
        const nodeLen = (node.textContent || '').length
        try {
            const range = document.createRange()
            range.setStart(node, Math.min(idx, nodeLen))
            range.setEnd(node, Math.min(idx + target.length, nodeLen))
            const rect = range.getBoundingClientRect()
            if (rect.width >= 2 && rect.height >= 2) return rect
        } catch {
            continue
        }
    }
    return spans[0].getBoundingClientRect()
}

export default function ReaderPage() {
    const params = useParams<{ id: string; bookId: string }>()
    const router = useRouter()
    const bookId = Number(params.bookId)

    const { data: book, isLoading } = useBook(bookId)
    const updateBook = useBookUpdate()
    const { data: highlights = [] } = useBookHighlights(bookId)
    const createHighlight = useHighlightCreate()
    const deleteHighlight = useHighlightDelete()
    const refreshDefinition = useHighlightRefreshDefinition()
    // Vocab highlights are tracked behind the scenes to drive the inline
    // translation badge — they should not pollute the user-facing sidebar.
    const sidebarHighlights = useMemo(
        () => highlights.filter(h => h.kind !== 'vocab'),
        [highlights],
    )

    const [pdfReady, setPdfReady] = useState(false)
    const [numPages, setNumPages] = useState<number | null>(null)
    const [page, setPage] = useState(1)
    // Vocab highlights are the saved-to-dictionary picks. By default the
    // sidebar shows only the current page; a "Show all in this book" toggle
    // expands to every page (sorted ascending) so the reader can browse
    // their whole vocab pool from this title without leaving the reader.
    const allVocab = useMemo(
        () => highlights.filter(h => h.kind === 'vocab'),
        [highlights],
    )
    const pageVocab = useMemo(
        () => allVocab.filter(h => h.page === page),
        [allVocab, page],
    )
    const sortedAllVocab = useMemo(() => {
        return [...allVocab].sort((a, b) => {
            if (a.page !== b.page) return a.page - b.page
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })
    }, [allVocab])
    const [pageInput, setPageInput] = useState('1')
    const [zoom, setZoom] = useState(1.1)
    const [showAllVocab, setShowAllVocab] = useState(false)
    const [selection, setSelection] = useState<Selection | null>(null)
    const [showHighlights, setShowHighlights] = useState(true)
    const [showHighlightOverlay, setShowHighlightOverlay] = useState(true)
    const [showTranslations, setShowTranslations] = useState(true)
    // Hover-driven translation tooltip — populated by the mouseover handler
    // when the cursor enters a marked vocab span, cleared on mouseout.
    const [vocabTooltip, setVocabTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
    const [saveDialogOpen, setSaveDialogOpen] = useState(false)
    // Bump this to force the resume flash effect to re-run even when the
    // page/text didn't change — used by the header chip's onClick.
    const [resumeFlashTick, setResumeFlashTick] = useState(0)
    // Bumps every time pdf.js finishes rendering a page. Effects that depend
    // on glyph positions (highlight overlay, translation badges) include this
    // in their dep array so they re-run with valid coordinates, not the
    // pre-layout zero-size rects.
    const [pageRenderTick, setPageRenderTick] = useState(0)
    const [containerWidth, setContainerWidth] = useState(720)
    const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null)
    const [fileError, setFileError] = useState<string | null>(null)

    const containerRef = useRef<HTMLDivElement>(null)
    const pageRef = useRef<HTMLDivElement>(null)
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ─── PDF runtime ────────────────────────────────────────────────────────
    useEffect(() => {
        ensurePdfJs().then(() => setPdfReady(true)).catch(() => setPdfReady(true))
    }, [])

    // Fetch the PDF bytes through our auth-aware fetch so 401s trigger the
    // shared refresh-and-retry path. react-pdf's own loader does its own
    // fetch and can't see our refresh flow, which is why we feed it bytes
    // instead of a URL.
    useEffect(() => {
        if (!bookId) return
        let cancelled = false
        setFileBytes(null)
        setFileError(null)
        ;(async () => {
            try {
                const res = await fetchWithAuth(API_ENDPOINTS.BOOKS.FILE(bookId))
                if (!res.ok) {
                    throw new Error(
                        res.status === 401
                            ? 'Session expired — please reload the page.'
                            : res.status === 404
                                ? 'PDF file is missing on the server.'
                                : `Server returned HTTP ${res.status}.`,
                    )
                }
                const buf = await res.arrayBuffer()
                if (cancelled) return
                // pdf.js needs the first bytes to be "%PDF-". If we got HTML
                // back (e.g. a reverse-proxy login page) we'd silently feed
                // garbage to pdf.js and get a generic parse error — catch
                // that here so the user sees the real cause.
                const bytes = new Uint8Array(buf)
                const head = String.fromCharCode(...bytes.slice(0, 5))
                if (head !== '%PDF-') {
                    const ct = res.headers.get('content-type') ?? 'unknown'
                    throw new Error(`Response wasn't a PDF (content-type: ${ct}). Reload or re-upload.`)
                }
                setFileBytes(bytes)
            } catch (err: unknown) {
                if (cancelled) return
                setFileError(err instanceof Error ? err.message : 'Failed to load PDF')
            }
        })()
        return () => { cancelled = true }
    }, [bookId])

    // pdf.js mutates the Uint8Array it receives, so each render gets a fresh
    // view over the same buffer. Otherwise the second render throws
    // "TypedArray is detached".
    const fileSource = useMemo(
        () => (fileBytes ? { data: new Uint8Array(fileBytes) } : null),
        [fileBytes],
    )

    // Initial page sync once book loads.
    useEffect(() => {
        if (book) {
            setPage(book.current_page || 1)
            setPageInput(String(book.current_page || 1))
        }
    }, [book])

    // ResizeObserver — keep the page width tied to the container so the
    // PDF fills nicely without horizontal scroll.
    useEffect(() => {
        if (!containerRef.current) return
        const obs = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerWidth(Math.max(280, entry.contentRect.width - 32))
            }
        })
        obs.observe(containerRef.current)
        return () => obs.disconnect()
    }, [])

    // ─── Page navigation + debounced bookmark save ──────────────────────────
    const totalPages = numPages ?? book?.total_pages ?? 0

    const goToPage = useCallback((target: number) => {
        const clamped = Math.max(1, Math.min(totalPages || target, target))
        setPage(clamped)
        setPageInput(String(clamped))
        setSelection(null)
    }, [totalPages])

    useEffect(() => {
        if (!book) return
        if (page === book.current_page) return
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => {
            updateBook.mutate({ id: book.id, data: { current_page: page } })
        }, 600)
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current)
        }
        // updateBook intentionally excluded — mutation identity is stable enough
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, book?.id, book?.current_page])

    // Keyboard arrows
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (saveDialogOpen) return
            const target = e.target as HTMLElement | null
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
            if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
                e.preventDefault()
                goToPage(page + 1)
            } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault()
                goToPage(page - 1)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [page, goToPage, saveDialogOpen])

    // ─── Text selection inside the rendered page ────────────────────────────
    const handleMouseUp = useCallback(() => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return setSelection(null)
        const text = sel.toString().trim()
        if (!text) return setSelection(null)
        if (text.length > 1500) return setSelection(null) // sanity guard
        // Only capture selections inside the page surface.
        if (!pageRef.current?.contains(sel.anchorNode as Node)) return
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        setSelection({ text, rect })
    }, [])

    // ─── Save selection to highlights (and optionally dictionary) ──────────
    const handleQuickHighlight = () => {
        if (!selection || !book) return
        createHighlight.mutate(
            {
                bookId: book.id,
                data: { page, text: selection.text, kind: 'highlight' },
            },
            { onSuccess: () => setSelection(null) },
        )
    }

    // ─── Mark this selection as the "resume here" pointer ──────────────────
    const handleResumeHere = () => {
        if (!selection || !book) return
        updateBook.mutate(
            { id: book.id, data: { resume_text: selection.text, resume_page: page } },
            { onSuccess: () => setSelection(null) },
        )
    }
    const handleClearResume = () => {
        if (!book) return
        updateBook.mutate({ id: book.id, data: { resume_text: null, resume_page: null } })
    }

    // ─── Jump to the resume pointer once: navigate to the page on first
    // book load, then on every page render, search the text layer for the
    // saved sentence and flash it. Uses a ref so we only auto-jump once.
    const resumeJumpedRef = useRef(false)
    useEffect(() => {
        if (!book?.resume_text || !book.resume_page) return
        if (resumeJumpedRef.current) return
        // Only auto-jump when the saved pointer differs from where we land —
        // book.current_page already places us on the right page most of the
        // time, but resume_page is the source of truth for sentence position.
        if (page !== book.resume_page) {
            setPage(book.resume_page)
            setPageInput(String(book.resume_page))
        }
        resumeJumpedRef.current = true
    }, [book?.resume_text, book?.resume_page, page])

    // After the PDF text layer renders, find every span the saved sentence
    // overlaps and flash all of them.
    useEffect(() => {
        if (!book?.resume_text || !book.resume_page) return
        if (page !== book.resume_page) return
        if (!pageRef.current) return

        let cancelled = false
        let attempts = 0
        const flashed: HTMLElement[] = []

        const tryFlash = () => {
            if (cancelled || !pageRef.current) return
            const layer = pageRef.current.querySelector('.react-pdf__Page__textContent')
            if (!layer) {
                if (++attempts < 30) requestAnimationFrame(tryFlash)
                return
            }
            const hits = spansForText(layer, book.resume_text || '')
            if (hits.length === 0) {
                if (++attempts < 30) requestAnimationFrame(tryFlash)
                return
            }
            hits[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
            hits.forEach(el => {
                el.classList.add('resume-flash')
                flashed.push(el)
            })
            setTimeout(() => {
                flashed.forEach(el => el.classList.remove('resume-flash'))
            }, 2400)
        }
        const id = setTimeout(tryFlash, 120)
        return () => {
            cancelled = true
            clearTimeout(id)
            flashed.forEach(el => el.classList.remove('resume-flash'))
        }
    }, [book?.resume_text, book?.resume_page, page, zoom, resumeFlashTick, pageRenderTick])

    // ─── Highlight overlay (kind='highlight') ──────────────────────────────
    // For each saved highlight on the current page, find its text in the
    // rendered text layer and apply a persistent yellow background class.
    // Re-runs whenever the page renders, the highlight set changes, or the
    // toggle flips. Cleanup removes the class so flipping the toggle off or
    // navigating away leaves the text layer pristine.
    useEffect(() => {
        if (!pageRef.current) return
        if (!showHighlightOverlay) return
        const pageHighlights = highlights.filter(h => h.page === page && h.kind === 'highlight')
        if (pageHighlights.length === 0) return

        let cancelled = false
        let attempts = 0
        const styled: HTMLElement[] = []

        const tryApply = () => {
            if (cancelled || !pageRef.current) return
            const layer = pageRef.current.querySelector('.react-pdf__Page__textContent')
            if (!layer) {
                if (++attempts < 30) requestAnimationFrame(tryApply)
                return
            }
            let anyHit = false
            for (const h of pageHighlights) {
                const hits = spansForText(layer, h.text)
                if (hits.length === 0) continue
                anyHit = true
                hits.forEach(el => {
                    el.classList.add('hl-overlay')
                    styled.push(el)
                })
            }
            // Text layer not fully mounted yet — retry a few frames.
            if (!anyHit && ++attempts < 30) requestAnimationFrame(tryApply)
        }
        const id = setTimeout(tryApply, 120)
        return () => {
            cancelled = true
            clearTimeout(id)
            styled.forEach(el => el.classList.remove('hl-overlay'))
        }
    }, [highlights, page, zoom, showHighlightOverlay, pageRenderTick])

    // ─── Vocab markers + hover tooltips ───────────────────────────────────
    // Earlier passes applied a CSS class to the matched pdf.js span — but
    // pdf.js typically packs an entire line into one span, so tinting the
    // span tinted the whole line. Instead, compute each word's exact rect
    // via the Range API and append an absolute-positioned overlay element
    // into the text layer. The overlay is sized to the word only, so it
    // never bleeds beyond the actual letters.
    useEffect(() => {
        if (!pageRef.current) return
        if (!showTranslations) return
        const placeholder = '(saved from reader — fill definition)'
        // Pick the English definition first; only fall back to the bilingual
        // translation when no real definition exists yet (backend default
        // placeholder shouldn't be shown as a meaning).
        const tooltipText = (h: BookHighlight): string => {
            const def = (h.definition || '').trim()
            if (def && def !== placeholder) return def
            return (h.translation || '').trim()
        }
        const pageVocab = highlights.filter(
            h => h.page === page && h.kind === 'vocab' && tooltipText(h),
        )
        if (pageVocab.length === 0) return

        let cancelled = false
        let attempts = 0
        const overlays: HTMLElement[] = []

        const tryApply = () => {
            if (cancelled || !pageRef.current) return
            const layer = pageRef.current.querySelector('.react-pdf__Page__textContent') as HTMLElement | null
            if (!layer) {
                if (++attempts < 30) requestAnimationFrame(tryApply)
                return
            }
            const layerRect = layer.getBoundingClientRect()
            // Some text layers come back zero-sized for a frame after a zoom
            // change — wait until they have real dimensions so our rects align.
            if (layerRect.width < 10 || layerRect.height < 10) {
                if (++attempts < 30) requestAnimationFrame(tryApply)
                return
            }
            let anyHit = false
            for (const h of pageVocab) {
                const hits = spansForText(layer, h.text)
                if (hits.length === 0) continue
                anyHit = true
                const text = tooltipText(h)
                // Strip trailing punctuation when measuring — same reason
                // as in spansForText: the comma may live in a different
                // run than the headword.
                const wordText = h.text.trim().replace(/[\p{P}\p{S}]+$/u, '').trim()
                if (wordText.length < 2) continue

                for (const span of hits) {
                    const wordRect = rectForText([span], wordText)
                    if (!wordRect || wordRect.width < 2 || wordRect.height < 2) continue
                    const overlay = document.createElement('span')
                    overlay.className = 'vocab-overlay-rect'
                    overlay.setAttribute('data-vocab-translation', text)
                    overlay.style.position = 'absolute'
                    overlay.style.left = `${wordRect.left - layerRect.left}px`
                    overlay.style.top = `${wordRect.top - layerRect.top}px`
                    overlay.style.width = `${wordRect.width}px`
                    overlay.style.height = `${wordRect.height}px`
                    layer.appendChild(overlay)
                    overlays.push(overlay)
                }
            }
            if (!anyHit && ++attempts < 30) requestAnimationFrame(tryApply)
        }
        const id = setTimeout(tryApply, 120)
        return () => {
            cancelled = true
            clearTimeout(id)
            overlays.forEach(el => el.remove())
        }
    }, [highlights, page, zoom, showTranslations, pageRenderTick])

    // Hover tooltip for vocab markers. Event delegation on the page surface
    // so we don't re-bind on every render. The tooltip itself is rendered
    // inside the page surface (see JSX below) using `vocabTooltip` state.
    useEffect(() => {
        const surface = pageRef.current
        if (!surface || !showTranslations) return

        const handleOver = (e: MouseEvent) => {
            const tgt = e.target as HTMLElement | null
            const span = tgt?.closest?.('[data-vocab-translation]') as HTMLElement | null
            if (!span) return
            const translation = span.getAttribute('data-vocab-translation') || ''
            if (!translation) return
            const rect = span.getBoundingClientRect()
            const surfaceRect = surface.getBoundingClientRect()
            setVocabTooltip({
                x: rect.left - surfaceRect.left + rect.width / 2,
                y: rect.top - surfaceRect.top,
                text: translation,
            })
        }
        const handleOut = (e: MouseEvent) => {
            const related = (e.relatedTarget as HTMLElement | null) ?? null
            if (related && related.closest?.('[data-vocab-translation]')) return
            setVocabTooltip(null)
        }
        surface.addEventListener('mouseover', handleOver)
        surface.addEventListener('mouseout', handleOut)
        return () => {
            surface.removeEventListener('mouseover', handleOver)
            surface.removeEventListener('mouseout', handleOut)
            setVocabTooltip(null)
        }
    }, [showTranslations])

    if (isLoading || !book) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col bg-[#070710]">
            {/* Header */}
            {/* The platform-wide <Header> is sticky top-0 z-50, so we offset
                this reader-specific bar by its height to stack below it. Both
                stay visible while scrolling the PDF. */}
            <div className="border-b border-white/5 bg-[#0a0a14]/60 backdrop-blur sticky top-[68px] z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
                    <button
                        onClick={() => router.push(`/platform/${params.id}/learning/library`)}
                        className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-lg"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-base font-medium text-white truncate">{book.title}</h1>
                        {book.author && (
                            <p className="text-xs text-white/40 truncate">{book.author}</p>
                        )}
                    </div>

                    {/* Page nav */}
                    <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-lg px-1 py-1">
                        <button
                            onClick={() => goToPage(page - 1)}
                            disabled={page <= 1}
                            className="p-1.5 text-white/60 hover:text-white hover:bg-white/5 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <input
                            value={pageInput}
                            onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
                            onBlur={() => goToPage(Number(pageInput) || page)}
                            onKeyDown={(e) => { if (e.key === 'Enter') goToPage(Number(pageInput) || page) }}
                            className="w-10 text-center bg-transparent text-white text-sm tabular-nums focus:outline-none"
                        />
                        <span className="text-xs text-white/30 tabular-nums pr-1">/ {totalPages || '?'}</span>
                        <button
                            onClick={() => goToPage(page + 1)}
                            disabled={!!totalPages && page >= totalPages}
                            className="p-1.5 text-white/60 hover:text-white hover:bg-white/5 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Zoom */}
                    <div className="hidden md:flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-lg px-1 py-1">
                        <button
                            onClick={() => setZoom(z => Math.max(0.6, +(z - 0.1).toFixed(2)))}
                            className="p-1.5 text-white/60 hover:text-white hover:bg-white/5 rounded"
                        >
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-white/40 tabular-nums w-10 text-center">
                            {Math.round(zoom * 100)}%
                        </span>
                        <button
                            onClick={() => setZoom(z => Math.min(2.5, +(z + 0.1).toFixed(2)))}
                            className="p-1.5 text-white/60 hover:text-white hover:bg-white/5 rounded"
                        >
                            <ZoomIn className="w-4 h-4" />
                        </button>
                    </div>

                    {book.resume_text && book.resume_page && (
                        <button
                            onClick={() => {
                                if (book.resume_page) goToPage(book.resume_page)
                                // Force a re-flash even when already on the
                                // resume page (no page change → flash effect
                                // deps wouldn't re-trigger otherwise).
                                setResumeFlashTick(t => t + 1)
                            }}
                            title={`Resume here · "${book.resume_text.slice(0, 80)}${book.resume_text.length > 80 ? '…' : ''}"`}
                            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border bg-emerald-500/10 border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/15 max-w-[200px]"
                        >
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">Resume · p.{book.resume_page}</span>
                            <span
                                role="button"
                                aria-label="Clear resume pointer"
                                onClick={(e) => { e.stopPropagation(); handleClearResume() }}
                                className="text-emerald-200/60 hover:text-red-300 cursor-pointer -mr-0.5"
                            >
                                <X className="w-3 h-3" />
                            </span>
                        </button>
                    )}
                    {/* On-page overlay toggles: yellow highlight marks +
                        inline translation badges for saved vocab words. */}
                    <button
                        onClick={() => setShowHighlightOverlay(s => !s)}
                        title="Toggle yellow highlight marks on the page"
                        className={`hidden md:flex items-center justify-center p-1.5 rounded-lg border transition-all ${
                            showHighlightOverlay
                                ? 'bg-amber-400/15 border-amber-400/30 text-amber-200'
                                : 'bg-white/[0.04] border-white/10 text-white/40 hover:text-white'
                        }`}
                    >
                        <Highlighter className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setShowTranslations(s => !s)}
                        title="Toggle inline translations for saved vocab words"
                        className={`hidden md:flex items-center justify-center p-1.5 rounded-lg border transition-all ${
                            showTranslations
                                ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                                : 'bg-white/[0.04] border-white/10 text-white/40 hover:text-white'
                        }`}
                    >
                        <Languages className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setShowHighlights(s => !s)}
                        className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                            showHighlights
                                ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                                : 'bg-white/[0.04] border-white/10 text-white/60 hover:text-white'
                        }`}
                    >
                        <Bookmark className="w-3.5 h-3.5" />
                        {sidebarHighlights.length}
                    </button>
                </div>

                {/* Progress line */}
                <div className="h-0.5 bg-white/5">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-400 to-violet-400 transition-all duration-300"
                        style={{ width: `${totalPages ? (page / totalPages) * 100 : 0}%` }}
                    />
                </div>
            </div>

            <div className="flex-1 max-w-7xl mx-auto w-full flex gap-4 px-4 py-6">
                {/* PDF column */}
                <div ref={containerRef} className="flex-1 min-w-0 relative">
                    <div
                        ref={pageRef}
                        onMouseUp={handleMouseUp}
                        className="relative bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden mx-auto"
                        style={{ maxWidth: containerWidth + 32 }}
                    >
                        {fileError ? (
                            <PdfError message={fileError} />
                        ) : !pdfReady || !fileSource ? (
                            <PdfLoading />
                        ) : (
                            <PdfDocument
                                file={fileSource}
                                onLoadSuccess={(doc: { numPages: number }) => setNumPages(doc.numPages)}
                                onLoadError={(err: Error) => {
                                    // pdf.js rejected the bytes — usually a
                                    // corrupted PDF or unsupported encryption.
                                    // Surface the actual parser message so the
                                    // user knows whether to retry or re-upload.
                                    setFileError(`pdf.js: ${err.message}`)
                                }}
                                loading={<PdfLoading />}
                                error={<PdfError message="pdf.js could not parse this file." />}
                                className="flex items-center justify-center min-h-[60vh]"
                            >
                                <PdfPage
                                    pageNumber={page}
                                    width={containerWidth}
                                    scale={zoom}
                                    renderTextLayer
                                    renderAnnotationLayer={false}
                                    loading={<PdfLoading />}
                                    // pdf.js finishes laying out glyphs here,
                                    // so any DOM-position-dependent effect
                                    // (highlight overlay, translation badge,
                                    // resume flash) needs to re-run after this.
                                    onRenderSuccess={() => setPageRenderTick(t => t + 1)}
                                />
                            </PdfDocument>
                        )}

                        {/* Hover translation tooltip — single floating element
                            positioned above the hovered vocab span. Pointer-
                            events disabled so moving the cursor between the
                            span and tooltip doesn't strand it. */}
                        {vocabTooltip && (
                            <div
                                className="absolute z-30 pointer-events-none px-2 py-1 rounded-md text-[11px] font-medium leading-tight bg-[#0a0a14]/95 border border-indigo-400/40 text-indigo-100 shadow-lg max-w-[260px] whitespace-normal text-center"
                                style={{
                                    left: `${vocabTooltip.x}px`,
                                    top: `${vocabTooltip.y}px`,
                                    transform: 'translate(-50%, calc(-100% - 6px))',
                                }}
                            >
                                {vocabTooltip.text}
                            </div>
                        )}
                    </div>

                    {/* Footer hint */}
                    <p className="text-center text-[11px] text-white/30 mt-3">
                        Tip — select text to save a highlight or push it to your dictionary. Use ← → keys to flip pages.
                    </p>
                </div>

                {/* Highlights + Dictionary sidebar */}
                {showHighlights && (
                    <aside className="hidden lg:flex flex-col w-80 shrink-0">
                        <div className="sticky top-24 max-h-[calc(100vh-7rem)] flex flex-col gap-3 overflow-hidden">
                            {/* Highlights card */}
                            <div className="flex flex-col bg-white/[0.02] border border-white/5 rounded-2xl p-4 overflow-hidden min-h-0">
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-sm font-medium text-white flex items-center gap-2">
                                        <Bookmark className="w-4 h-4 text-amber-300" />
                                        Highlights
                                    </h2>
                                    <span className="text-xs text-white/40">{sidebarHighlights.length}</span>
                                </div>

                                {sidebarHighlights.length === 0 ? (
                                    <p className="text-xs text-white/30 leading-relaxed">
                                        Nothing yet. Select text on the page and tap Highlight to save your first one.
                                    </p>
                                ) : (
                                    <div className="overflow-y-auto -mr-2 pr-2 space-y-2">
                                        {sidebarHighlights.map(h => (
                                            <HighlightRow
                                                key={h.id}
                                                highlight={h}
                                                onJump={() => goToPage(h.page)}
                                                onDelete={() =>
                                                    deleteHighlight.mutate({ bookId: book.id, highlightId: h.id })
                                                }
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Dictionary card */}
                            <div className="flex flex-col bg-white/[0.02] border border-white/5 rounded-2xl p-4 overflow-hidden min-h-0">
                                <div className="flex items-center justify-between mb-1">
                                    <h2 className="text-sm font-medium text-white flex items-center gap-2">
                                        <Languages className="w-4 h-4 text-indigo-300" />
                                        Dictionary
                                    </h2>
                                    <span className="text-xs text-white/40">
                                        {showAllVocab ? sortedAllVocab.length : pageVocab.length}
                                    </span>
                                </div>
                                <p className="text-[11px] text-white/35 mb-3">
                                    {showAllVocab
                                        ? 'Every word saved from this book.'
                                        : `Words saved on page ${page}.`}
                                </p>

                                {(() => {
                                    const list = showAllVocab ? sortedAllVocab : pageVocab
                                    if (list.length === 0) {
                                        return (
                                            <p className="text-xs text-white/30 leading-relaxed">
                                                {showAllVocab
                                                    ? <>No words yet. Select text and tap <span className="text-indigo-300">Save word</span> to add a dictionary entry tied to this book.</>
                                                    : <>Nothing on this page yet. Select text and tap <span className="text-indigo-300">Save word</span>, or browse all words from this book below.</>}
                                            </p>
                                        )
                                    }
                                    return (
                                        <div className="overflow-y-auto -mr-2 pr-2 space-y-1.5">
                                            {list.map(h => (
                                                <VocabRow
                                                    key={h.id}
                                                    highlight={h}
                                                    onCurrentPage={h.page === page}
                                                    onJump={() => goToPage(h.page)}
                                                    onDelete={() =>
                                                        deleteHighlight.mutate({ bookId: book.id, highlightId: h.id })
                                                    }
                                                    onRefresh={() =>
                                                        refreshDefinition.mutate({ bookId: book.id, highlightId: h.id })
                                                    }
                                                    isRefreshing={
                                                        refreshDefinition.isPending &&
                                                        refreshDefinition.variables?.highlightId === h.id
                                                    }
                                                />
                                            ))}
                                        </div>
                                    )
                                })()}

                                {/* Show all / current-page toggle. Only render when there's
                                    extra context to reveal — i.e. when the book has any
                                    vocab outside the current page. */}
                                {sortedAllVocab.length > pageVocab.length && (
                                    <button
                                        onClick={() => setShowAllVocab(v => !v)}
                                        className="mt-3 text-xs text-indigo-300 hover:text-indigo-200 font-medium self-start"
                                    >
                                        {showAllVocab
                                            ? `← Show current page only (${pageVocab.length})`
                                            : `Show all in this book (${sortedAllVocab.length}) →`}
                                    </button>
                                )}
                            </div>
                        </div>
                    </aside>
                )}
            </div>

            {/* Selection popover */}
            <SelectionPopover
                selection={selection}
                onHighlight={handleQuickHighlight}
                onSaveWord={() => setSaveDialogOpen(true)}
                onResumeHere={handleResumeHere}
                onDismiss={() => setSelection(null)}
                isSaving={createHighlight.isPending}
                isMarkingResume={updateBook.isPending}
            />

            <AnimatePresence>
                {saveDialogOpen && selection && (
                    <SaveToDictionaryDialog
                        text={selection.text}
                        page={page}
                        bookId={book.id}
                        onClose={() => setSaveDialogOpen(false)}
                        onDone={() => { setSaveDialogOpen(false); setSelection(null) }}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}

// ─── Small components ───────────────────────────────────────────────────────

function PdfLoading() {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-white/40">
            <Loader2 className="w-6 h-6 animate-spin mb-3" />
            <p className="text-xs">Loading PDF…</p>
        </div>
    )
}

function PdfError({ message }: { message?: string } = {}) {
    return (
        <div className="py-20 text-center text-red-300">
            <BookOpen className="w-8 h-8 text-red-400/60 mx-auto mb-3" />
            <p className="text-sm">Could not load this PDF.</p>
            <p className="text-xs text-white/40 mt-1">
                {message ?? 'The file may be corrupted or your session expired.'}
            </p>
        </div>
    )
}

function VocabRow({
    highlight, onCurrentPage, onJump, onDelete, onRefresh, isRefreshing,
}: {
    highlight: BookHighlight
    onCurrentPage: boolean
    onJump: () => void
    onDelete: () => void
    onRefresh: () => void
    isRefreshing: boolean
}) {
    const word = highlight.text.trim()
    // English definition is the primary subline. The placeholder string
    // backend uses for fresh saves shouldn't render — fall back to the
    // bilingual translation only if no real definition exists yet.
    const placeholder = '(saved from reader — fill definition)'
    const hasDefinition = !!highlight.definition && highlight.definition.trim() !== placeholder
    const subline = hasDefinition ? highlight.definition : highlight.translation
    const needsLookup = !hasDefinition && !highlight.translation
    const fullDef = hasDefinition ? highlight.definition!.trim() : ''
    const fullTrans = (highlight.translation || '').trim()
    // Open the full-text popover only when there's something worth showing
    // beyond the truncated 2-line subline. A tiny delay keeps it from
    // flickering as the cursor flies past the row.
    const hasOverflow = fullDef.length > 80 || fullTrans.length > 0
    const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null)
    const rowRef = useRef<HTMLDivElement | null>(null)
    const openTimer = useRef<number | null>(null)
    const closeTimer = useRef<number | null>(null)
    // The dictionary panel uses overflow-y-auto, which implicitly clips the
    // x-axis too — so an absolute popover anchored "right-full" would be
    // chopped off at the panel's left edge. Position via fixed coords from
    // the row's bounding rect instead so the popover escapes any clipping.
    const POPOVER_W = 288
    const GAP = 12
    const openNow = () => {
        if (!hasOverflow || !rowRef.current) return
        const r = rowRef.current.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        // Default: anchor to the row's left. Flip to the right when the
        // popover would clip the viewport edge.
        let left = r.left - POPOVER_W - GAP
        if (left < 8) left = Math.min(r.right + GAP, vw - POPOVER_W - 8)
        // Keep within the visible vertical band; the popover is ~180px tall.
        const top = Math.max(8, Math.min(r.top, vh - 200))
        setPopoverPos({ left, top })
    }
    const scheduleOpen = () => {
        if (!hasOverflow) return
        if (closeTimer.current) {
            window.clearTimeout(closeTimer.current)
            closeTimer.current = null
        }
        if (openTimer.current) return
        openTimer.current = window.setTimeout(() => {
            openNow()
            openTimer.current = null
        }, 200)
    }
    const scheduleClose = () => {
        if (openTimer.current) {
            window.clearTimeout(openTimer.current)
            openTimer.current = null
        }
        if (closeTimer.current) return
        closeTimer.current = window.setTimeout(() => {
            setPopoverPos(null)
            closeTimer.current = null
        }, 100)
    }
    useEffect(() => () => {
        if (openTimer.current) window.clearTimeout(openTimer.current)
        if (closeTimer.current) window.clearTimeout(closeTimer.current)
    }, [])

    return (
        <div
            ref={rowRef}
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
            className={`group relative px-2.5 py-2 rounded-lg border transition-colors ${
                onCurrentPage
                    ? 'border-indigo-400/40 bg-indigo-500/[0.09]'
                    : 'border-white/8 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.04]'
            }`}
        >
            {popoverPos && typeof document !== 'undefined' && createPortal(
                <div
                    onMouseEnter={scheduleOpen}
                    onMouseLeave={scheduleClose}
                    style={{
                        position: 'fixed',
                        left: popoverPos.left,
                        top: popoverPos.top,
                        width: POPOVER_W,
                        zIndex: 9999,
                    }}
                    className="pointer-events-auto"
                >
                    <div
                        className="rounded-xl border border-white/10 shadow-2xl shadow-black/70 overflow-hidden"
                        style={{ backgroundColor: '#0f1019', isolation: 'isolate' }}
                    >
                        <div
                            className="px-4 pt-3 pb-2.5 flex items-center justify-between gap-3 relative"
                            style={{ backgroundColor: '#0f1019' }}
                        >
                            <p className="text-sm font-semibold text-white truncate">{word}</p>
                            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded font-medium bg-white/10 text-white/70 shrink-0">
                                p.{highlight.page}
                            </span>
                        </div>
                        <div
                            className="px-4 pb-3 space-y-2.5 relative"
                            style={{ backgroundColor: '#0f1019' }}
                        >
                            {fullDef && (
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300/70 mb-1">
                                        Definition
                                    </p>
                                    <p className="text-sm text-white/85 leading-relaxed">
                                        {fullDef}
                                    </p>
                                </div>
                            )}
                            {fullTrans && (
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300/70 mb-1">
                                        Translation
                                    </p>
                                    <p className="text-sm text-white/75 leading-relaxed">
                                        {fullTrans}
                                    </p>
                                </div>
                            )}
                            {!fullDef && !fullTrans && (
                                <p className="text-sm text-amber-300/80 italic">
                                    No definition yet. Click ↻ on the row to fetch.
                                </p>
                            )}
                        </div>
                    </div>
                </div>,
                document.body,
            )}
            <div className="flex items-start gap-2">
                <button
                    onClick={onJump}
                    className="flex-1 min-w-0 text-left"
                    aria-label="Jump to page"
                >
                    <p className={`text-sm font-medium leading-tight truncate ${onCurrentPage ? 'text-white' : 'text-white/90'}`}>
                        {word}
                    </p>
                    {subline ? (
                        <p className="text-xs text-white/55 leading-snug mt-0.5 line-clamp-2">
                            {subline}
                        </p>
                    ) : (
                        <p className="text-xs text-amber-300/70 italic leading-snug mt-0.5">
                            No definition yet — click ↻ to fetch.
                        </p>
                    )}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded font-medium ${
                        onCurrentPage ? 'bg-indigo-500/20 text-indigo-200' : 'bg-white/5 text-white/40'
                    }`}>
                        p.{highlight.page}
                    </span>
                    <button
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        className={`${needsLookup ? 'opacity-100 text-amber-300/80 hover:text-amber-200' : 'opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/70'} transition p-0.5 disabled:opacity-50`}
                        title={needsLookup ? 'Look up definition' : 'Refresh definition'}
                    >
                        <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={onDelete}
                        className="opacity-0 group-hover:opacity-100 transition text-white/30 hover:text-red-300 p-0.5"
                        title="Remove from this book"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </div>
    )
}

function HighlightRow({
    highlight, onJump, onDelete,
}: {
    highlight: BookHighlight
    onJump: () => void
    onDelete: () => void
}) {
    const kindColor =
        highlight.kind === 'vocab' ? 'border-indigo-500/30 bg-indigo-500/[0.06]' :
        highlight.kind === 'note' ? 'border-sky-500/30 bg-sky-500/[0.06]' :
        'border-amber-500/30 bg-amber-500/[0.06]'
    const kindLabel = highlight.kind === 'vocab' ? 'word' : highlight.kind
    return (
        <div className={`group relative p-2.5 rounded-lg border ${kindColor}`}>
            <div className="flex items-center justify-between mb-1.5">
                <button
                    onClick={onJump}
                    className="text-[10px] uppercase tracking-wider font-medium text-white/50 hover:text-white"
                >
                    {kindLabel} · p.{highlight.page}
                </button>
                <button
                    onClick={onDelete}
                    className="opacity-0 group-hover:opacity-100 transition text-white/30 hover:text-red-300 p-0.5"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
            <p className="text-xs text-white/80 leading-snug line-clamp-3">{highlight.text}</p>
            {highlight.note && (
                <p className="text-[11px] text-white/50 italic mt-1.5 line-clamp-2">{highlight.note}</p>
            )}
        </div>
    )
}

function SelectionPopover({
    selection, onHighlight, onSaveWord, onResumeHere, onDismiss, isSaving, isMarkingResume,
}: {
    selection: Selection | null
    onHighlight: () => void
    onSaveWord: () => void
    onResumeHere: () => void
    onDismiss: () => void
    isSaving: boolean
    isMarkingResume: boolean
}) {
    if (!selection || !selection.rect) return null
    const top = selection.rect.top + window.scrollY - 48
    const left = selection.rect.left + window.scrollX + selection.rect.width / 2
    return (
        <div
            data-selection-popover
            style={{
                position: 'absolute',
                top: `${Math.max(8, top)}px`,
                left: `${left}px`,
                transform: 'translateX(-50%)',
                zIndex: 40,
            }}
            className="flex items-center gap-1 bg-[#0a0a14] border border-white/15 rounded-lg shadow-xl p-1"
        >
            <button
                onClick={onHighlight}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10 rounded transition disabled:opacity-50"
            >
                <Highlighter className="w-3.5 h-3.5" />
                Highlight
            </button>
            <span className="w-px h-4 bg-white/10" />
            <button
                onClick={onSaveWord}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-indigo-200 hover:bg-indigo-500/10 rounded transition"
            >
                <Sparkles className="w-3.5 h-3.5" />
                Save word
            </button>
            <span className="w-px h-4 bg-white/10" />
            <button
                onClick={onResumeHere}
                disabled={isMarkingResume}
                title="Mark this sentence — next time the book opens, jump here"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/10 rounded transition disabled:opacity-50"
            >
                {isMarkingResume
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <MapPin className="w-3.5 h-3.5" />}
                Resume here
            </button>
            <button
                onClick={onDismiss}
                className="p-1 text-white/30 hover:text-white hover:bg-white/5 rounded"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}

function SaveToDictionaryDialog({
    text, page, bookId, onClose, onDone,
}: {
    text: string
    page: number
    bookId: number
    onClose: () => void
    onDone: () => void
}) {
    const [folderId, setFolderId] = useState<number | undefined>(undefined)
    const [moduleId, setModuleId] = useState<number | undefined>(undefined)
    const [note, setNote] = useState('')
    // Inline-create state: null = show the select, '' or string = show the
    // input. Matches the same affordance on the Reading page.
    const [newFolderName, setNewFolderName] = useState<string | null>(null)
    const [newModuleName, setNewModuleName] = useState<string | null>(null)
    const { data: folders = [] } = useFolders()
    const { data: modules = [] } = useModules(folderId)
    const createHighlight = useHighlightCreate()
    const { mutateAsync: createFolder, isPending: isCreatingFolder } = useFolderCreate()
    const { mutateAsync: createModule, isPending: isCreatingModule } = useModuleCreate()

    const handleCreateFolder = async () => {
        const name = (newFolderName || '').trim()
        if (!name) return
        const created = await createFolder({ name })
        setFolderId(created.id)
        setModuleId(undefined)
        setNewFolderName(null)
    }
    const handleCreateModule = async () => {
        const name = (newModuleName || '').trim()
        if (!name || !folderId) return
        const created = await createModule({ folder_id: folderId, name })
        setModuleId(created.id)
        setNewModuleName(null)
    }

    const handleSave = () => {
        createHighlight.mutate(
            {
                bookId,
                data: {
                    page,
                    text,
                    note: note.trim() || undefined,
                    kind: 'vocab',
                    module_id: moduleId,
                    save_to_dictionary: true,
                },
            },
            { onSuccess: onDone },
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-[#0a0a14] border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-300" />
                        Save to dictionary
                    </h2>
                    <button onClick={onClose} className="p-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/5">
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1.5">Selection · page {page}</p>
                    <p className="text-sm text-white/90 leading-snug line-clamp-3">{text}</p>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-300">Folder</label>
                                <button
                                    type="button"
                                    onClick={() => setNewFolderName(newFolderName === null ? '' : null)}
                                    className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-0.5"
                                >
                                    {newFolderName === null
                                        ? <><Plus className="w-3 h-3" />New</>
                                        : <><X className="w-3 h-3" />Cancel</>}
                                </button>
                            </div>
                            {newFolderName === null ? (
                                <SelectInput
                                    value={folderId ? String(folderId) : ''}
                                    onChange={(v: string) => {
                                        setFolderId(v ? Number(v) : undefined)
                                        setModuleId(undefined)
                                    }}
                                    options={[
                                        { value: '', label: 'None (orphan)' },
                                        ...folders.map((f: DictionaryFolder) => ({ value: String(f.id), label: f.name })),
                                    ]}
                                />
                            ) : (
                                <div className="flex gap-2">
                                    <Input
                                        autoFocus
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder() }}
                                        placeholder="New folder name…"
                                        className="bg-white/[0.04] border-white/10 text-white"
                                    />
                                    <Button
                                        size="sm"
                                        onClick={handleCreateFolder}
                                        disabled={!newFolderName.trim() || isCreatingFolder}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                    >
                                        {isCreatingFolder ? '…' : 'Add'}
                                    </Button>
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-300">Module</label>
                                <button
                                    type="button"
                                    onClick={() => setNewModuleName(newModuleName === null ? '' : null)}
                                    disabled={!folderId}
                                    className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    {newModuleName === null
                                        ? <><Plus className="w-3 h-3" />New</>
                                        : <><X className="w-3 h-3" />Cancel</>}
                                </button>
                            </div>
                            {newModuleName === null ? (
                                <SelectInput
                                    value={moduleId ? String(moduleId) : ''}
                                    onChange={(v: string) => setModuleId(v ? Number(v) : undefined)}
                                    options={[
                                        { value: '', label: folderId ? 'Pick a module…' : 'Pick folder first' },
                                        ...modules.map((m: DictionaryModule) => ({ value: String(m.id), label: m.name })),
                                    ]}
                                />
                            ) : (
                                <div className="flex gap-2">
                                    <Input
                                        autoFocus
                                        value={newModuleName}
                                        onChange={(e) => setNewModuleName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateModule() }}
                                        placeholder="New module name…"
                                        className="bg-white/[0.04] border-white/10 text-white"
                                    />
                                    <Button
                                        size="sm"
                                        onClick={handleCreateModule}
                                        disabled={!newModuleName.trim() || isCreatingModule}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                    >
                                        {isCreatingModule ? '…' : 'Add'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    <FormField label="Your note (optional)" description="Becomes the dictionary definition placeholder — you can edit later from the Dictionary page.">
                        <TextareaInput
                            value={note}
                            onChange={setNote}
                            placeholder="e.g. context: protagonist describes the storm…"
                            rows={3}
                        />
                    </FormField>

                    {createHighlight.isError && (
                        <p className="text-xs text-red-400">Could not save. Try again.</p>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                        <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={createHighlight.isPending}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                        >
                            {createHighlight.isPending
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Plus className="w-4 h-4" />}
                            Save word
                        </Button>
                    </div>

                    <p className="text-[11px] text-white/30 leading-relaxed flex items-start gap-1.5">
                        <ListChecks className="w-3 h-3 mt-0.5 shrink-0" />
                        We&apos;ll create a dictionary entry tagged with this book + page. Fill the full definition from the Dictionary page when you have a moment.
                    </p>
                </div>
            </motion.div>
        </motion.div>
    )
}
