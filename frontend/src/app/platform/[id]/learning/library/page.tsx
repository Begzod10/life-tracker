'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft, BookOpen, Plus, Upload, Search, Trash2, X, Loader2,
    BookMarked, CheckCircle2, Clock,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FormField, TextInput, SelectInput } from '@/components/modals/form-components'
import {
    useBooks, useBookUpload, useLibraryStats,
    type Book, type BookStatus,
} from '@/lib/hooks/use-books'

const STATUS_LABEL: Record<BookStatus | 'all', string> = {
    all: 'All',
    reading: 'Reading',
    want: 'Want to read',
    done: 'Finished',
}

const STATUS_ACCENT: Record<BookStatus, string> = {
    reading: 'from-amber-500/15 to-amber-500/0 border-amber-500/30 text-amber-200',
    want: 'from-sky-500/15 to-sky-500/0 border-sky-500/30 text-sky-200',
    done: 'from-emerald-500/15 to-emerald-500/0 border-emerald-500/30 text-emerald-200',
}

const STATUS_ICON: Record<BookStatus, typeof BookOpen> = {
    reading: BookMarked,
    want: Clock,
    done: CheckCircle2,
}

export default function LibraryPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [filter, setFilter] = useState<BookStatus | 'all'>('all')
    const [search, setSearch] = useState('')
    const [uploadOpen, setUploadOpen] = useState(false)
    const [dragOver, setDragOver] = useState(false)

    const { data: books, isLoading } = useBooks(filter === 'all' ? undefined : filter)
    const { data: stats } = useLibraryStats()

    const filteredBooks = useMemo(() => {
        const items = books?.items ?? []
        if (!search.trim()) return items
        const q = search.toLowerCase()
        return items.filter(b =>
            b.title.toLowerCase().includes(q) ||
            (b.author?.toLowerCase().includes(q) ?? false),
        )
    }, [books, search])

    const countByStatus = books?.by_status ?? {}

    const handleFileDrop = (files: FileList | null) => {
        if (!files || files.length === 0) return
        const file = files[0]
        if (!file.name.toLowerCase().endsWith('.pdf')) return
        setUploadOpen(true)
        // The dialog reads pendingFile via ref-passing, so stash on window quickly:
        window.dispatchEvent(new CustomEvent('library:upload-file', { detail: file }))
    }

    return (
        <div
            className="min-h-screen p-8 relative"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                handleFileDrop(e.dataTransfer?.files ?? null)
            }}
        >
            {/* Drag-overlay */}
            <AnimatePresence>
                {dragOver && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-indigo-500/10 backdrop-blur-sm border-2 border-dashed border-indigo-400/60"
                    >
                        <div className="rounded-2xl bg-black/60 border border-indigo-400/40 px-8 py-6 text-center">
                            <Upload className="w-8 h-8 text-indigo-300 mx-auto mb-2" />
                            <p className="text-indigo-100 font-medium">Drop PDF to add to your library</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="max-w-6xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 mb-8"
                >
                    <button
                        onClick={() => router.push(`/platform/${params.id}/learning`)}
                        className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-white tracking-tight">Library</h1>
                        <p className="text-sm text-white/50 mt-1">Read PDFs, track pages, mine vocabulary as you go.</p>
                    </div>
                    <Button
                        onClick={() => setUploadOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add book
                    </Button>
                </motion.div>

                {/* Stats strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <StatTile label="Books" value={stats?.total_books ?? 0} accent="text-indigo-300" />
                    <StatTile label="Reading" value={stats?.by_status?.reading ?? 0} accent="text-amber-300" />
                    <StatTile label="Finished" value={stats?.by_status?.done ?? 0} accent="text-emerald-300" />
                    <StatTile label="Pages · 30d" value={stats?.pages_last_30d ?? 0} accent="text-sky-300" />
                </div>

                {/* Filter chips */}
                <div className="flex items-center gap-2 mb-5 flex-wrap">
                    {(['all', 'reading', 'want', 'done'] as const).map((s) => {
                        const active = filter === s
                        const count = s === 'all'
                            ? (books?.total ?? 0)
                            : (countByStatus[s] ?? 0)
                        return (
                            <button
                                key={s}
                                onClick={() => setFilter(s)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                                    active
                                        ? 'bg-white text-black border-white'
                                        : 'bg-white/[0.03] text-white/70 border-white/10 hover:bg-white/[0.06] hover:text-white'
                                }`}
                            >
                                {STATUS_LABEL[s]}
                                <span className={`ml-1.5 ${active ? 'text-black/50' : 'text-white/40'}`}>
                                    {count}
                                </span>
                            </button>
                        )
                    })}
                    <div className="ml-auto relative w-full md:w-72">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search title or author…"
                            className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-400/40"
                        />
                    </div>
                </div>

                {/* Grid */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
                    </div>
                ) : filteredBooks.length === 0 ? (
                    <EmptyState onClick={() => setUploadOpen(true)} />
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredBooks.map((b, i) => (
                            <BookCard
                                key={b.id}
                                book={b}
                                index={i}
                                onOpen={() => router.push(`/platform/${params.id}/learning/library/${b.id}`)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
        </div>
    )
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function StatTile({ label, value, accent }: { label: string; value: number; accent: string }) {
    return (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <p className={`text-2xl font-bold ${accent}`}>{value}</p>
            <p className="text-xs text-white/40 mt-1 uppercase tracking-wider">{label}</p>
        </div>
    )
}

function BookCard({ book, index, onOpen }: { book: Book; index: number; onOpen: () => void }) {
    const Icon = STATUS_ICON[book.status]
    const accent = STATUS_ACCENT[book.status]
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 12) * 0.025 }}
        >
            <Card
                onClick={onOpen}
                className={`relative group cursor-pointer overflow-hidden p-0 bg-gradient-to-b ${accent} border hover:scale-[1.02] hover:shadow-lg transition-all`}
            >
                {/* Cover area */}
                <div className="aspect-[3/4] flex items-center justify-center relative overflow-hidden">
                    {book.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={book.cover_url}
                            alt={book.title}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <BookOpen className="w-12 h-12 text-white/15" />
                            </div>
                        </div>
                    )}
                    <div className="absolute top-2 right-2 z-10">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-white/90`}>
                            <Icon className="w-3 h-3" />
                            {STATUS_LABEL[book.status]}
                        </span>
                    </div>
                </div>
                {/* Title */}
                <div className="p-3 bg-black/40 backdrop-blur-sm border-t border-white/5">
                    <p className="text-sm font-medium text-white line-clamp-2 leading-snug">{book.title}</p>
                    {book.author && (
                        <p className="text-xs text-white/40 mt-1 line-clamp-1">{book.author}</p>
                    )}
                    {/* Progress */}
                    <div className="mt-2.5 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-400 to-violet-400"
                                style={{ width: `${book.progress_percent}%` }}
                            />
                        </div>
                        <span className="text-[10px] text-white/50 tabular-nums shrink-0">
                            {book.current_page}/{book.total_pages || '?'}
                        </span>
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

function EmptyState({ onClick }: { onClick: () => void }) {
    return (
        <div className="border border-dashed border-white/10 rounded-2xl p-12 text-center bg-white/[0.01]">
            <BookOpen className="w-12 h-12 text-white/15 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white/80 mb-1">Your library is empty</h3>
            <p className="text-sm text-white/40 mb-5">Upload a PDF to start reading and tracking progress.</p>
            <Button onClick={onClick} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                <Upload className="w-4 h-4" />
                Upload your first PDF
            </Button>
            <p className="text-xs text-white/30 mt-3">…or drag a PDF anywhere on this page</p>
        </div>
    )
}

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [file, setFile] = useState<File | null>(null)
    const [title, setTitle] = useState('')
    const [author, setAuthor] = useState('')
    const [status, setStatus] = useState<BookStatus>('reading')
    const inputRef = useRef<HTMLInputElement>(null)
    const upload = useBookUpload()

    // Pick up files dropped on the page background
    useEffect(() => {
        const handler = (e: Event) => {
            const f = (e as CustomEvent<File>).detail
            if (f) {
                setFile(f)
                setTitle((prev) => prev || f.name.replace(/\.pdf$/i, ''))
            }
        }
        window.addEventListener('library:upload-file', handler)
        return () => window.removeEventListener('library:upload-file', handler)
    }, [])

    if (!open) return null

    const handleSubmit = () => {
        if (!file) return
        upload.mutate(
            { file, title: title.trim() || undefined, author: author.trim() || undefined, status },
            {
                onSuccess: () => {
                    setFile(null); setTitle(''); setAuthor(''); setStatus('reading')
                    onClose()
                },
            },
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-[#0a0a14] border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-white">Add book to library</h2>
                    <button onClick={onClose} className="p-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-4">
                    <FormField label="PDF file" required>
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            className={`w-full border border-dashed rounded-lg p-4 text-left transition-all ${
                                file
                                    ? 'border-indigo-400/40 bg-indigo-500/5'
                                    : 'border-white/15 bg-white/[0.02] hover:border-white/25'
                            }`}
                        >
                            {file ? (
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded bg-indigo-500/15">
                                        <BookOpen className="w-4 h-4 text-indigo-300" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white truncate">{file.name}</p>
                                        <p className="text-xs text-white/40">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 text-white/50">
                                    <Upload className="w-4 h-4" />
                                    <span className="text-sm">Choose a PDF…</span>
                                </div>
                            )}
                        </button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={(e) => {
                                const f = e.target.files?.[0] ?? null
                                setFile(f)
                                if (f && !title) setTitle(f.name.replace(/\.pdf$/i, ''))
                            }}
                            className="hidden"
                        />
                    </FormField>

                    <FormField label="Title">
                        <TextInput value={title} onChange={setTitle} placeholder="(auto-detected from PDF if blank)" />
                    </FormField>

                    <FormField label="Author">
                        <TextInput value={author} onChange={setAuthor} placeholder="Optional" />
                    </FormField>

                    <FormField label="Status">
                        <SelectInput
                            value={status}
                            onChange={(v: string) => setStatus(v as BookStatus)}
                            options={[
                                { value: 'reading', label: 'Reading' },
                                { value: 'want', label: 'Want to read' },
                                { value: 'done', label: 'Finished' },
                            ]}
                        />
                    </FormField>

                    {upload.isError && (
                        <p className="text-xs text-red-400">
                            Upload failed. Try a smaller PDF (under 60 MB).
                        </p>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={!file || upload.isPending}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                        >
                            {upload.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Upload className="w-4 h-4" />
                            )}
                            Upload
                        </Button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    )
}
