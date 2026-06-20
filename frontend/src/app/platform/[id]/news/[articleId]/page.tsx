'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft, ExternalLink, Calendar, Tag, Sparkles, Newspaper,
    ZoomIn, ZoomOut, X, Loader2, BookmarkPlus, Check, Plus, FolderOpen,
} from 'lucide-react'
import { useNewsItem } from '@/lib/hooks/use-news'
import {
    useAiWordDetails, useWordCreate, useFolders, useModules,
    useFolderCreate, useModuleCreate,
} from '@/lib/hooks/use-dictionary'
import {
    readLastVocabTarget, rememberLastVocabTarget,
} from '@/lib/last-vocab-target'

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
    Business:      'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    Sports:        'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    Health:        'bg-rose-500/15 text-rose-300 border-rose-500/30',
    Science:       'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    Entertainment: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    Automotive:    'bg-blue-500/15 text-blue-300 border-blue-500/30',
    Nation:        'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
}

function sourceAvatarColor(name: string) {
    const colors = [
        'bg-indigo-500', 'bg-violet-500', 'bg-blue-500',
        'bg-emerald-500', 'bg-violet-500', 'bg-rose-500',
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

// ─── Selection popover (floats above selected text) ──────────────────────────

interface TextSelection {
    text: string
    rect: DOMRect
}

function SelectionPopover({
    selection, isSaving, hasQuickTarget, onSave, onDismiss,
}: {
    selection: TextSelection | null
    isSaving: boolean
    hasQuickTarget: boolean
    onSave: () => void
    onDismiss: () => void
}) {
    if (!selection) return null

    const top = selection.rect.top + window.scrollY - 48
    const HALF = 140
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
    const rawLeft = selection.rect.left + window.scrollX + selection.rect.width / 2
    const left = Math.min(Math.max(rawLeft, window.scrollX + HALF + 8), window.scrollX + vw - HALF - 8)

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
                onClick={onSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-indigo-200 hover:bg-indigo-500/10 rounded transition disabled:opacity-50"
            >
                {isSaving
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <BookmarkPlus className="w-3.5 h-3.5" />}
                {hasQuickTarget ? 'Save word' : 'Save to dictionary'}
            </button>
            <span className="w-px h-4 bg-white/10" />
            <button
                onClick={onDismiss}
                className="p-1 text-white/30 hover:text-white hover:bg-white/5 rounded"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}

// ─── Word lookup popup (single-word click) ───────────────────────────────────

interface WordLookupState {
    word: string
    rect: DOMRect
}

function WordLookupPopup({
    lookup, onSave, onDismiss,
}: {
    lookup: WordLookupState
    onSave: (word: string) => void
    onDismiss: () => void
}) {
    const { mutate, isPending, data } = useAiWordDetails()

    useEffect(() => { mutate(lookup.word) }, [lookup.word, mutate])

    const top = lookup.rect.top + window.scrollY - 8
    const HALF = 160
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
    const rawLeft = lookup.rect.left + window.scrollX + lookup.rect.width / 2
    const left = Math.min(Math.max(rawLeft, window.scrollX + HALF + 8), window.scrollX + vw - HALF - 8)

    return (
        <div
            data-word-lookup-popup
            style={{
                position: 'absolute',
                top: `${Math.max(8, top)}px`,
                left: `${left}px`,
                transform: 'translateX(-50%) translateY(-100%)',
                zIndex: 40,
                width: 280,
            }}
            className="bg-[#0d0d1a] border border-white/15 rounded-xl shadow-2xl overflow-hidden"
        >
            {/* Word header */}
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-sm font-bold text-white truncate">{lookup.word}</span>
                    {data?.phonetic && <span className="text-xs text-white/40 shrink-0">{data.phonetic}</span>}
                    {data?.part_of_speech && (
                        <span className="text-[10px] text-indigo-300/70 bg-indigo-500/10 px-1.5 py-0.5 rounded shrink-0">{data.part_of_speech}</span>
                    )}
                </div>
                <button onClick={onDismiss} className="ml-2 p-1 text-white/30 hover:text-white shrink-0 rounded transition">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Definition / translation */}
            <div className="px-3 pb-1 min-h-[40px]">
                {isPending ? (
                    <p className="text-xs text-white/30 flex items-center gap-1.5 py-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Looking up…
                    </p>
                ) : data?.definition ? (
                    <p className="text-xs text-white/65 leading-relaxed">{data.definition}</p>
                ) : (
                    <p className="text-xs text-white/25 italic">No definition found</p>
                )}
                {data?.translation && (
                    <p className="text-xs text-indigo-300/70 mt-0.5">{data.translation}</p>
                )}
            </div>

            {/* Save button */}
            <div className="px-3 pb-3 pt-1">
                <button
                    onClick={() => onSave(lookup.word)}
                    disabled={isPending}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-indigo-600/30 border border-indigo-500/30 text-indigo-200 text-xs font-medium hover:bg-indigo-600/50 disabled:opacity-40 transition"
                >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Save to dictionary
                </button>
            </div>
        </div>
    )
}

// ─── Save dialog ─────────────────────────────────────────────────────────────

function SaveDialog({
    text, onClose,
}: {
    text: string
    onClose: (saved: boolean) => void
}) {
    const stored = useMemo(() => readLastVocabTarget(), [])
    const [folderId, setFolderId] = useState<number | undefined>(stored.folderId)
    const [moduleId, setModuleId] = useState<number | undefined>(stored.moduleId)
    const [newFolderName, setNewFolderName] = useState<string | null>(null)
    const [newModuleName, setNewModuleName] = useState<string | null>(null)

    const { data: folders = [] } = useFolders()
    const { data: modules = [] } = useModules(folderId)
    const { mutateAsync: createFolder, isPending: creatingFolder } = useFolderCreate()
    const { mutateAsync: createModule, isPending: creatingModule } = useModuleCreate()
    const wordCreate = useWordCreate()
    const lookupWord = useAiWordDetails()
    const [wordData, setWordData] = useState<{ definition: string; translation?: string; phonetic?: string; part_of_speech?: string; difficulty?: string; examples?: string[] } | null>(null)

    // Fetch definition for the selected word/phrase
    useEffect(() => {
        if (text.trim().split(/\s+/).length <= 3) {
            lookupWord.mutate(text.trim(), { onSuccess: d => setWordData(d) })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text])

    // Drop stale IDs
    useEffect(() => {
        if (folderId && folders.length > 0 && !folders.some(f => f.id === folderId)) {
            setFolderId(undefined); setModuleId(undefined)
        }
    }, [folders, folderId])
    useEffect(() => {
        if (moduleId && modules.length > 0 && !modules.some(m => m.id === moduleId)) {
            setModuleId(undefined)
        }
    }, [modules, moduleId])

    const handleCreateFolder = async () => {
        const name = (newFolderName ?? '').trim()
        if (!name) return
        const created = await createFolder({ name })
        setFolderId(created.id); setModuleId(undefined); setNewFolderName(null)
    }
    const handleCreateModule = async () => {
        const name = (newModuleName ?? '').trim()
        if (!name || !folderId) return
        const created = await createModule({ folder_id: folderId, name })
        setModuleId(created.id); setNewModuleName(null)
    }

    const handleSave = () => {
        if (!moduleId) return
        wordCreate.mutate(
            {
                module_id: moduleId,
                word: text.trim(),
                definition: wordData?.definition ?? '',
                translation: wordData?.translation,
                phonetic: wordData?.phonetic,
                part_of_speech: wordData?.part_of_speech,
                difficulty: wordData?.difficulty,
                examples: wordData?.examples,
            },
            {
                onSuccess: () => {
                    rememberLastVocabTarget(folderId, moduleId)
                    onClose(true)
                },
            },
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => onClose(false)}
        >
            <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-sm bg-[#0a0a14] border border-white/10 rounded-2xl p-5 shadow-2xl space-y-4"
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white flex items-center gap-2">
                        <BookmarkPlus className="w-4 h-4 text-indigo-300" />
                        Save to dictionary
                    </h2>
                    <button onClick={() => onClose(false)} className="p-1 text-white/30 hover:text-white hover:bg-white/5 rounded-lg transition">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Word preview */}
                <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <p className="text-sm font-bold text-white">{text}</p>
                    {lookupWord.isPending && (
                        <p className="text-xs text-white/30 mt-1 flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin" /> Fetching definition…
                        </p>
                    )}
                    {wordData?.definition && (
                        <p className="text-xs text-white/45 mt-0.5 leading-relaxed line-clamp-2">{wordData.definition}</p>
                    )}
                </div>

                {/* Folder select */}
                <div className="space-y-1.5">
                    <label className="text-xs text-white/40 uppercase tracking-wider">Folder</label>
                    {newFolderName === null ? (
                        <div className="flex gap-2">
                            <select
                                value={folderId ?? ''}
                                onChange={e => { setFolderId(e.target.value ? Number(e.target.value) : undefined); setModuleId(undefined) }}
                                className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-sm text-white appearance-none outline-none focus:border-indigo-500/50"
                            >
                                <option value="">— choose folder —</option>
                                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                            <button onClick={() => setNewFolderName('')} className="px-3 py-2 rounded-xl border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition" title="New folder">
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setNewFolderName(null) }}
                                placeholder="Folder name"
                                className="flex-1 bg-white/[0.04] border border-indigo-500/40 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                            <button onClick={handleCreateFolder} disabled={creatingFolder || !newFolderName?.trim()}
                                className="px-3 py-2 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs disabled:opacity-40 transition">
                                {creatingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                            </button>
                            <button onClick={() => setNewFolderName(null)} className="px-2 text-white/30 hover:text-white transition"><X className="w-4 h-4" /></button>
                        </div>
                    )}
                </div>

                {/* Module select */}
                {folderId && (
                    <div className="space-y-1.5">
                        <label className="text-xs text-white/40 uppercase tracking-wider">Module</label>
                        {newModuleName === null ? (
                            <div className="flex gap-2">
                                <select
                                    value={moduleId ?? ''}
                                    onChange={e => setModuleId(e.target.value ? Number(e.target.value) : undefined)}
                                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-sm text-white appearance-none outline-none focus:border-indigo-500/50"
                                >
                                    <option value="">— choose module —</option>
                                    {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                <button onClick={() => setNewModuleName('')} className="px-3 py-2 rounded-xl border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition" title="New module">
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <input autoFocus value={newModuleName} onChange={e => setNewModuleName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreateModule(); if (e.key === 'Escape') setNewModuleName(null) }}
                                    placeholder="Module name"
                                    className="flex-1 bg-white/[0.04] border border-indigo-500/40 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                                <button onClick={handleCreateModule} disabled={creatingModule || !newModuleName?.trim()}
                                    className="px-3 py-2 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs disabled:opacity-40 transition">
                                    {creatingModule ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                                </button>
                                <button onClick={() => setNewModuleName(null)} className="px-2 text-white/30 hover:text-white transition"><X className="w-4 h-4" /></button>
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={handleSave}
                    disabled={!moduleId || wordCreate.isPending}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-sm transition flex items-center justify-center gap-2"
                >
                    {wordCreate.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                        : <><BookmarkPlus className="w-4 h-4" /> Save word</>}
                </button>

                {wordCreate.isError && (
                    <p className="text-xs text-red-400 text-center">Failed to save — try again.</p>
                )}
            </motion.div>
        </motion.div>
    )
}

// ─── Reading toolbar ─────────────────────────────────────────────────────────

function ReadingToolbar({
    fontSize, onIncrease, onDecrease, quickTarget, onTargetToggle,
}: {
    fontSize: number
    onIncrease: () => void
    onDecrease: () => void
    quickTarget: { folderId?: number; moduleId?: number }
    onTargetToggle: () => void
}) {
    return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
            {/* Quick-save folder link */}
            <button
                onClick={onTargetToggle}
                title={quickTarget.folderId ? 'Quick-save folder set — click to change' : 'Link a folder for instant saves'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition text-xs font-medium ${
                    quickTarget.folderId
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                        : 'border-white/10 text-white/40 hover:text-white hover:bg-white/5'
                }`}
            >
                <FolderOpen className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-white/10" />

            <button onClick={onDecrease} disabled={fontSize <= FONT_MIN} title="Decrease font size"
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-25 transition">
                <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-white/35 w-6 text-center tabular-nums">{fontSize}</span>
            <button onClick={onIncrease} disabled={fontSize >= FONT_MAX} title="Increase font size"
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-25 transition">
                <ZoomIn className="w-4 h-4" />
            </button>
        </div>
    )
}

// ─── Folder link picker (mirrors BookTargetPicker) ────────────────────────────

function FolderLinkPicker({
    current, onSave, onClose,
}: {
    current: { folderId?: number; moduleId?: number }
    onSave: (t: { folderId?: number; moduleId?: number }) => void
    onClose: () => void
}) {
    const [folderId, setFolderId] = useState<number | undefined>(current.folderId)
    const [moduleId, setModuleId] = useState<number | undefined>(current.moduleId)
    const [newFolderName, setNewFolderName] = useState<string | null>(null)
    const [newModuleName, setNewModuleName] = useState<string | null>(null)
    const { data: folders = [] } = useFolders()
    const { data: modules = [] } = useModules(folderId)
    const { mutateAsync: createFolder, isPending: creatingFolder } = useFolderCreate()
    const { mutateAsync: createModule, isPending: creatingModule } = useModuleCreate()

    const handleCreateFolder = async () => {
        const name = (newFolderName ?? '').trim()
        if (!name) return
        const created = await createFolder({ name })
        setFolderId(created.id); setModuleId(undefined); setNewFolderName(null)
    }
    const handleCreateModule = async () => {
        const name = (newModuleName ?? '').trim()
        if (!name || !folderId) return
        const created = await createModule({ folder_id: folderId, name })
        setModuleId(created.id); setNewModuleName(null)
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
                onClick={e => e.stopPropagation()}
                className="w-full max-w-sm bg-[#0a0a14] border border-white/10 rounded-2xl p-5 shadow-2xl space-y-4"
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-emerald-300" />
                        Link quick-save folder
                    </h2>
                    <button onClick={onClose} className="p-1 text-white/30 hover:text-white hover:bg-white/5 rounded-lg transition">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                    Select a folder and module. After that, selecting any word in the article saves it instantly — no dialog needed.
                </p>

                {/* Folder */}
                <div className="space-y-1.5">
                    <label className="text-xs text-white/40 uppercase tracking-wider">Folder</label>
                    {newFolderName === null ? (
                        <div className="flex gap-2">
                            <select value={folderId ?? ''} onChange={e => { setFolderId(e.target.value ? Number(e.target.value) : undefined); setModuleId(undefined) }}
                                className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-sm text-white appearance-none outline-none focus:border-emerald-500/50">
                                <option value="">— choose folder —</option>
                                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                            <button onClick={() => setNewFolderName('')} className="px-3 py-2 rounded-xl border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition" title="New folder">
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setNewFolderName(null) }}
                                placeholder="Folder name"
                                className="flex-1 bg-white/[0.04] border border-emerald-500/40 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                            <button onClick={handleCreateFolder} disabled={creatingFolder || !newFolderName?.trim()}
                                className="px-3 py-2 rounded-xl bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs disabled:opacity-40 transition">
                                {creatingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                            </button>
                            <button onClick={() => setNewFolderName(null)} className="px-2 text-white/30 hover:text-white transition"><X className="w-4 h-4" /></button>
                        </div>
                    )}
                </div>

                {/* Module */}
                {folderId && (
                    <div className="space-y-1.5">
                        <label className="text-xs text-white/40 uppercase tracking-wider">Module</label>
                        {newModuleName === null ? (
                            <div className="flex gap-2">
                                <select value={moduleId ?? ''} onChange={e => setModuleId(e.target.value ? Number(e.target.value) : undefined)}
                                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-sm text-white appearance-none outline-none focus:border-emerald-500/50">
                                    <option value="">— choose module —</option>
                                    {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                <button onClick={() => setNewModuleName('')} className="px-3 py-2 rounded-xl border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition" title="New module">
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <input autoFocus value={newModuleName} onChange={e => setNewModuleName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreateModule(); if (e.key === 'Escape') setNewModuleName(null) }}
                                    placeholder="Module name"
                                    className="flex-1 bg-white/[0.04] border border-emerald-500/40 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                                <button onClick={handleCreateModule} disabled={creatingModule || !newModuleName?.trim()}
                                    className="px-3 py-2 rounded-xl bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs disabled:opacity-40 transition">
                                    {creatingModule ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                                </button>
                                <button onClick={() => setNewModuleName(null)} className="px-2 text-white/30 hover:text-white transition"><X className="w-4 h-4" /></button>
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={() => { onSave({ folderId, moduleId }); onClose() }}
                    disabled={!folderId || !moduleId}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-sm transition"
                >
                    Link folder
                </button>
            </motion.div>
        </motion.div>
    )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ArticleProfilePage() {
    const params = useParams<{ id: string; articleId: string }>()
    const router = useRouter()
    const articleId = parseInt(params.articleId, 10)
    const { data: item, isLoading, error } = useNewsItem(isNaN(articleId) ? null : articleId)
    const wordCreate = useWordCreate()
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

    // Quick-save target (linked folder/module)
    const [quickTarget, setQuickTarget] = useState<{ folderId?: number; moduleId?: number }>(() => readLastVocabTarget())
    const [folderPickerOpen, setFolderPickerOpen] = useState(false)

    // Text selection
    const [selection, setSelection] = useState<TextSelection | null>(null)
    const [saveDialogOpen, setSaveDialogOpen] = useState(false)
    const [quickSaveToast, setQuickSaveToast] = useState<string | null>(null)
    const [wordLookup, setWordLookup] = useState<WordLookupState | null>(null)
    const articleRef = useRef<HTMLDivElement>(null)

    const captureSelection = useCallback(() => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) { setSelection(null); return }
        const text = sel.toString().trim()
        if (!text) { setSelection(null); return }
        // Only capture selections inside the article text area
        if (!articleRef.current?.contains(sel.anchorNode as Node)) return
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        setSelection({ text, rect })
    }, [])

    const handleMouseUp = useCallback(() => {
        // Small delay so getRangeAt has the finalized range
        setTimeout(captureSelection, 30)
    }, [captureSelection])

    // Single-word click → show definition popup
    const handleArticleClick = useCallback((e: React.MouseEvent) => {
        // Ignore if there's a real text selection (dragged)
        const sel = window.getSelection()
        if (sel && sel.toString().trim()) return

        const range = (document.caretRangeFromPoint as ((x: number, y: number) => Range | null) | undefined)?.(e.clientX, e.clientY)
        if (!range) return
        // Expand to word boundaries manually
        const textNode = range.startContainer
        if (textNode.nodeType !== Node.TEXT_NODE) return
        const text = textNode.textContent ?? ''
        let start = range.startOffset
        let end = range.startOffset
        while (start > 0 && /\w/.test(text[start - 1])) start--
        while (end < text.length && /\w/.test(text[end])) end++
        range.setStart(textNode, start)
        range.setEnd(textNode, end)
        const word = range.toString().trim().replace(/[^a-zA-Z''-]/g, '')
        if (!word || word.length < 2) return

        const rect = range.getBoundingClientRect()
        setWordLookup({ word, rect })
        setSelection(null)
    }, [])

    // selectionchange covers mobile handle dragging
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null
        const onChange = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(captureSelection, 150)
        }
        document.addEventListener('selectionchange', onChange)
        return () => {
            document.removeEventListener('selectionchange', onChange)
            if (timer) clearTimeout(timer)
        }
    }, [captureSelection])

    // Dismiss popovers when clicking outside them
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            const target = e.target as Element
            if (!target.closest('[data-selection-popover]')) setSelection(null)
            if (!target.closest('[data-word-lookup-popup]')) setWordLookup(null)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [])

    const handleSave = useCallback(() => {
        if (!selection) return
        if (quickTarget.folderId && quickTarget.moduleId) {
            // Quick-save: look up definition then save
            const word = selection.text
            lookupWord.mutate(word, {
                onSuccess: (data) => {
                    wordCreate.mutate({
                        module_id: quickTarget.moduleId!,
                        word,
                        definition: data.definition,
                        translation: data.translation,
                        phonetic: data.phonetic,
                        part_of_speech: data.part_of_speech,
                        difficulty: data.difficulty,
                        examples: data.examples,
                    }, {
                        onSuccess: () => {
                            setSelection(null)
                            setQuickSaveToast(word.slice(0, 40))
                            setTimeout(() => setQuickSaveToast(null), 2200)
                        },
                    })
                },
            })
        } else {
            setSaveDialogOpen(true)
        }
    }, [selection, quickTarget, lookupWord, wordCreate])

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
    const isSaving = lookupWord.isPending || wordCreate.isPending

    return (
        <>
            {/* Save dialog */}
            <AnimatePresence>
                {saveDialogOpen && selection && (
                    <SaveDialog
                        text={selection.text}
                        onClose={(saved) => {
                            setSaveDialogOpen(false)
                            if (saved) setSelection(null)
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Folder link picker */}
            <AnimatePresence>
                {folderPickerOpen && (
                    <FolderLinkPicker
                        current={quickTarget}
                        onSave={(t) => { setQuickTarget(t); rememberLastVocabTarget(t.folderId, t.moduleId) }}
                        onClose={() => setFolderPickerOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Article content — position:relative so the selection popover can be absolute */}
            <div className="relative min-h-screen p-4 sm:p-6 lg:p-8">
                {/* Selection popover */}
                <SelectionPopover
                    selection={selection}
                    isSaving={isSaving}
                    hasQuickTarget={!!(quickTarget.folderId && quickTarget.moduleId)}
                    onSave={handleSave}
                    onDismiss={() => setSelection(null)}
                />

                {/* Word lookup popup */}
                {wordLookup && (
                    <WordLookupPopup
                        lookup={wordLookup}
                        onDismiss={() => setWordLookup(null)}
                        onSave={(word) => {
                            setWordLookup(null)
                            if (quickTarget.folderId && quickTarget.moduleId) {
                                lookupWord.mutate(word, {
                                    onSuccess: (data) => {
                                        wordCreate.mutate({
                                            module_id: quickTarget.moduleId!,
                                            word,
                                            definition: data.definition,
                                            translation: data.translation,
                                            phonetic: data.phonetic,
                                            part_of_speech: data.part_of_speech,
                                            difficulty: data.difficulty,
                                            examples: data.examples,
                                        }, {
                                            onSuccess: () => {
                                                setQuickSaveToast(word.slice(0, 40))
                                                setTimeout(() => setQuickSaveToast(null), 2200)
                                            },
                                        })
                                    },
                                })
                            } else {
                                setSelection({ text: word, rect: wordLookup.rect })
                                setSaveDialogOpen(true)
                            }
                        }}
                    />
                )}

                {/* Quick-save toast */}
                <AnimatePresence>
                    {quickSaveToast && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-sm flex items-center gap-2 shadow-lg pointer-events-none"
                        >
                            <Check className="w-4 h-4 shrink-0" />
                            Saved: &ldquo;{quickSaveToast}{quickSaveToast.length >= 40 ? '…' : ''}&rdquo;
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="max-w-2xl mx-auto">
                    {/* Top bar */}
                    <div className="flex items-center justify-between mb-6 gap-3">
                        <motion.button
                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
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
                                quickTarget={quickTarget}
                                onTargetToggle={() => setFolderPickerOpen(true)}
                            />
                        </motion.div>
                    </div>

                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
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
                                src={item.image_url} alt=""
                                className="w-full h-64 sm:h-80 object-cover rounded-2xl border border-white/10"
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                            />
                        )}

                        {/* Headline */}
                        <h1 className="font-bold text-white leading-snug" style={{ fontSize: Math.round(fontSize * 1.45) + 'px' }}>
                            {item.headline}
                        </h1>

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

                        {/* Article body — selection + click-to-lookup events */}
                        <div ref={articleRef} onMouseUp={handleMouseUp} onClick={handleArticleClick} onTouchEnd={() => setTimeout(captureSelection, 50)}>
                            {item.content ? (
                                <div className="space-y-3">
                                    <p className="text-xs text-white/35 uppercase tracking-wide">Full article</p>
                                    <div
                                        className="text-white/75 leading-relaxed whitespace-pre-line select-text"
                                        style={{ fontSize: fontSize + 'px' }}
                                    >
                                        {item.content}
                                    </div>
                                </div>
                            ) : item.description && item.description !== item.summary && (
                                <div className="space-y-1.5">
                                    <p className="text-xs text-white/35 uppercase tracking-wide">From source</p>
                                    <p className="text-white/60 leading-relaxed select-text" style={{ fontSize: fontSize + 'px' }}>
                                        {item.description}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Read original CTA */}
                        <a
                            href={item.url} target="_blank" rel="noopener noreferrer"
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
