'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft, ChevronLeft, ChevronRight, Loader2, Plus, Sparkles, X,
    BookOpen, Highlighter, Bookmark, ZoomIn, ZoomOut, Trash2, ListChecks,
    MapPin,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FormField, SelectInput, TextareaInput } from '@/components/modals/form-components'
import { API_ENDPOINTS } from '@/lib/api/endpoints'
import { fetchWithAuth } from '@/lib/api/fetch-with-auth'
import {
    useBook, useBookUpdate, useBookHighlights, useHighlightCreate, useHighlightDelete,
    type BookHighlight,
} from '@/lib/hooks/use-books'
import {
    useFolders, useModules,
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

export default function ReaderPage() {
    const params = useParams<{ id: string; bookId: string }>()
    const router = useRouter()
    const bookId = Number(params.bookId)

    const { data: book, isLoading } = useBook(bookId)
    const updateBook = useBookUpdate()
    const { data: highlights = [] } = useBookHighlights(bookId)
    const createHighlight = useHighlightCreate()
    const deleteHighlight = useHighlightDelete()

    const [pdfReady, setPdfReady] = useState(false)
    const [numPages, setNumPages] = useState<number | null>(null)
    const [page, setPage] = useState(1)
    const [pageInput, setPageInput] = useState('1')
    const [zoom, setZoom] = useState(1.1)
    const [selection, setSelection] = useState<Selection | null>(null)
    const [showHighlights, setShowHighlights] = useState(true)
    const [saveDialogOpen, setSaveDialogOpen] = useState(false)
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

    // After the PDF text layer renders, find the saved sentence and flash it.
    // pdf.js builds the text layer asynchronously, so we poll briefly with rAF.
    useEffect(() => {
        if (!book?.resume_text || !book.resume_page) return
        if (page !== book.resume_page) return
        if (!pageRef.current) return

        const target = book.resume_text.trim()
        if (target.length < 4) return

        let cancelled = false
        let attempts = 0
        const tryFlash = () => {
            if (cancelled || !pageRef.current) return
            const layer = pageRef.current.querySelector('.react-pdf__Page__textContent')
            const spans = layer
                ? Array.from(layer.querySelectorAll('span'))
                : []
            // pdf.js renders one <span> per text run, not per sentence — find
            // the run that contains the start of the target, then scroll to it.
            const normalized = target.replace(/\s+/g, ' ').toLowerCase()
            const head = normalized.slice(0, Math.min(40, normalized.length))
            const hit = spans.find(s =>
                s.textContent &&
                s.textContent.replace(/\s+/g, ' ').toLowerCase().includes(head),
            )
            if (hit) {
                hit.scrollIntoView({ behavior: 'smooth', block: 'center' })
                hit.classList.add('resume-flash')
                setTimeout(() => hit.classList.remove('resume-flash'), 2400)
                return
            }
            if (++attempts < 30) requestAnimationFrame(tryFlash)
        }
        // Give the text layer a moment to mount.
        const id = setTimeout(tryFlash, 120)
        return () => { cancelled = true; clearTimeout(id) }
    }, [book?.resume_text, book?.resume_page, page, zoom])

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
            <div className="border-b border-white/5 bg-[#0a0a14]/60 backdrop-blur sticky top-0 z-30">
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
                    <button
                        onClick={() => setShowHighlights(s => !s)}
                        className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                            showHighlights
                                ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                                : 'bg-white/[0.04] border-white/10 text-white/60 hover:text-white'
                        }`}
                    >
                        <Highlighter className="w-3.5 h-3.5" />
                        Highlights · {highlights.length}
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
                        className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden mx-auto"
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
                                />
                            </PdfDocument>
                        )}
                    </div>

                    {/* Footer hint */}
                    <p className="text-center text-[11px] text-white/30 mt-3">
                        Tip — select text to save a highlight or push it to your dictionary. Use ← → keys to flip pages.
                    </p>
                </div>

                {/* Highlights sidebar */}
                {showHighlights && (
                    <aside className="hidden lg:flex flex-col w-80 shrink-0">
                        <div className="sticky top-24 max-h-[calc(100vh-7rem)] flex flex-col bg-white/[0.02] border border-white/5 rounded-2xl p-4 overflow-hidden">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-medium text-white flex items-center gap-2">
                                    <Bookmark className="w-4 h-4 text-amber-300" />
                                    Highlights
                                </h2>
                                <span className="text-xs text-white/40">{highlights.length}</span>
                            </div>

                            {highlights.length === 0 ? (
                                <p className="text-xs text-white/30 leading-relaxed">
                                    Nothing yet. Select text on the page to save your first highlight or word.
                                </p>
                            ) : (
                                <div className="overflow-y-auto -mr-2 pr-2 space-y-2">
                                    {highlights.map(h => (
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
    const { data: folders = [] } = useFolders()
    const { data: modules = [] } = useModules(folderId)
    const createHighlight = useHighlightCreate()

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
                        <FormField label="Folder">
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
                        </FormField>
                        <FormField label="Module">
                            <SelectInput
                                value={moduleId ? String(moduleId) : ''}
                                onChange={(v: string) => setModuleId(v ? Number(v) : undefined)}
                                options={[
                                    { value: '', label: folderId ? 'Pick a module…' : 'Pick folder first' },
                                    ...modules.map((m: DictionaryModule) => ({ value: String(m.id), label: m.name })),
                                ]}
                            />
                        </FormField>
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
