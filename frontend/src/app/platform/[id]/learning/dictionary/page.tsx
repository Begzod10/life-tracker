'use client'

import { useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft, Plus, Search, Trash2, Edit2, X, ChevronDown,
    Folder as FolderIcon, BookOpen, Layers, AlertCircle, Target, BookMarked,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    useFolders, useFolderCreate, useFolderUpdate, useFolderDelete,
    useModules, useModuleCreate, useModuleUpdate, useModuleDelete,
    useDictionaryWords, useWordCreate, useWordUpdate, useWordDelete, useDictStats,
    type DictionaryWord, type WordCreate, type DictionaryFolder, type DictionaryModule,
    type DictStats,
} from '@/lib/hooks/use-dictionary'
import { FormField, TextInput, TextareaInput, SelectInput } from '@/components/modals/form-components'

const DIFFICULTIES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const POS_OPTIONS = [
    { value: 'noun', label: 'Noun' },
    { value: 'verb', label: 'Verb' },
    { value: 'adjective', label: 'Adjective' },
    { value: 'adverb', label: 'Adverb' },
    { value: 'phrase', label: 'Phrase' },
    { value: 'idiom', label: 'Idiom' },
]
const DIFF_COLOR: Record<string, string> = {
    A1: 'bg-green-500/15 text-green-400 border-green-500/20',
    A2: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    B1: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    B2: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
    C1: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    C2: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
}

const FOLDER_COLORS = [
    { value: '#3b82f6', name: 'blue' },
    { value: '#8b5cf6', name: 'purple' },
    { value: '#ec4899', name: 'pink' },
    { value: '#f59e0b', name: 'amber' },
    { value: '#10b981', name: 'green' },
    { value: '#ef4444', name: 'red' },
    { value: '#6b7280', name: 'gray' },
]

// ─── Stats panel ─────────────────────────────────────────────────────────────

const DIFF_BAR_COLOR: Record<string, string> = {
    A1: 'bg-green-400',
    A2: 'bg-emerald-400',
    B1: 'bg-blue-400',
    B2: 'bg-indigo-400',
    C1: 'bg-purple-400',
    C2: 'bg-rose-400',
}

function StatsPanel({
    stats,
    isLoading,
    scopeLabel,
}: {
    stats?: DictStats
    isLoading: boolean
    scopeLabel: string
}) {
    if (isLoading) {
        return <div className="h-32 bg-white/3 rounded-2xl animate-pulse mb-6" />
    }
    if (!stats || stats.total === 0) return null

    const reviewedPct = stats.total > 0 ? Math.round((stats.reviewed / stats.total) * 100) : 0
    const diffEntries = DIFFICULTIES
        .map(d => ({ level: d, count: stats.by_difficulty[d] ?? 0 }))
        .filter(e => e.count > 0)

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-white/10 rounded-2xl p-5 space-y-5"
        >
            <div className="flex items-baseline justify-between">
                <h3 className="text-xs uppercase tracking-wider text-white/40 font-medium">{scopeLabel}</h3>
                {stats.needs_review_total > 0 && (
                    <span className="text-xs text-amber-300/80 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {stats.needs_review_total} need{stats.needs_review_total === 1 ? 's' : ''} review
                    </span>
                )}
            </div>

            <div className="grid grid-cols-3 gap-4">
                <Stat icon={BookMarked} label="Words" value={stats.total} accent="text-white" />
                <Stat
                    icon={Target}
                    label="Reviewed"
                    value={`${stats.reviewed}/${stats.total}`}
                    sub={`${reviewedPct}%`}
                    accent="text-blue-300"
                />
                <Stat
                    icon={Target}
                    label="Accuracy"
                    value={stats.reviewed > 0 ? `${stats.accuracy}%` : '—'}
                    accent={
                        stats.accuracy >= 80 ? 'text-green-400'
                            : stats.accuracy >= 60 ? 'text-amber-300'
                                : stats.reviewed > 0 ? 'text-rose-400'
                                    : 'text-white/40'
                    }
                />
            </div>

            {diffEntries.length > 0 && (
                <div>
                    <p className="text-xs text-white/40 mb-2">By level</p>
                    <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
                        {diffEntries.map(e => (
                            <div
                                key={e.level}
                                className={DIFF_BAR_COLOR[e.level] ?? 'bg-white/30'}
                                style={{ width: `${(e.count / stats.total) * 100}%` }}
                                title={`${e.level}: ${e.count}`}
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
                        {diffEntries.map(e => (
                            <span key={e.level} className="text-white/60">
                                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${DIFF_BAR_COLOR[e.level] ?? 'bg-white/30'}`} />
                                {e.level} <span className="text-white/40">{e.count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {stats.needs_review.length > 0 && (
                <div className="pt-4 border-t border-white/5">
                    <p className="text-xs text-white/40 mb-2">Needs review</p>
                    <div className="flex flex-wrap gap-1.5">
                        {stats.needs_review.map(w => (
                            <span
                                key={w.id}
                                className="inline-flex items-center gap-1.5 text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1"
                            >
                                <span className={`text-[10px] font-mono px-1 rounded ${DIFF_COLOR[w.difficulty] ?? 'text-white/40'}`}>
                                    {w.difficulty}
                                </span>
                                <span className="text-white/80">{w.word}</span>
                                <span className="text-white/30">
                                    {w.review_count === 0 ? 'new' : `${w.accuracy}%`}
                                </span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    )
}

function Stat({
    icon: Icon, label, value, sub, accent,
}: {
    icon: React.FC<{ className?: string }>
    label: string
    value: string | number
    sub?: string
    accent: string
}) {
    return (
        <div>
            <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1">
                <Icon className="w-3 h-3" />
                {label}
            </div>
            <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</span>
                {sub && <span className="text-xs text-white/40">{sub}</span>}
            </div>
        </div>
    )
}

// ─── Word form ───────────────────────────────────────────────────────────────

type WordFormData = {
    word: string
    definition: string
    translation: string
    part_of_speech: string
    phonetic: string
    examples: string
    difficulty: string
    tags: string
}

const emptyWordForm = (): WordFormData => ({
    word: '', definition: '', translation: '',
    part_of_speech: 'noun', phonetic: '',
    examples: '', difficulty: 'B1', tags: '',
})

function toWordPayload(f: WordFormData, moduleId: number): WordCreate {
    return {
        module_id: moduleId,
        word: f.word.trim(),
        definition: f.definition.trim(),
        translation: f.translation.trim() || undefined,
        part_of_speech: f.part_of_speech || undefined,
        phonetic: f.phonetic.trim() || undefined,
        examples: f.examples.trim()
            ? f.examples.split('\n').map(s => s.trim()).filter(Boolean)
            : undefined,
        difficulty: f.difficulty,
        tags: f.tags.trim() || undefined,
    }
}

function WordForm({ initial, onSubmit, isPending, onCancel }: {
    initial: WordFormData
    onSubmit: (form: WordFormData) => void
    isPending: boolean
    onCancel: () => void
}) {
    const [form, setForm] = useState(initial)
    const set = (field: keyof WordFormData) => (v: string) => setForm(p => ({ ...p, [field]: v }))

    return (
        <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <FormField label="Word" required>
                    <TextInput value={form.word} onChange={set('word')} placeholder="e.g. Perseverance" />
                </FormField>
                <FormField label="Phonetic">
                    <TextInput value={form.phonetic} onChange={set('phonetic')} placeholder="/ˌpɜː.sɪˈvɪər.əns/" />
                </FormField>
            </div>

            <FormField label="Definition" required>
                <TextareaInput value={form.definition} onChange={set('definition')} placeholder="Continued effort despite difficulties..." />
            </FormField>

            <FormField label="Translation (Uzbek / Russian)">
                <TextInput value={form.translation} onChange={set('translation')} placeholder="e.g. Qat'iyat / Настойчивость" />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
                <FormField label="Part of Speech">
                    <SelectInput value={form.part_of_speech} onChange={set('part_of_speech')} options={POS_OPTIONS} />
                </FormField>
                <FormField label="Difficulty">
                    <SelectInput value={form.difficulty} onChange={set('difficulty')}
                        options={DIFFICULTIES.map(d => ({ value: d, label: d }))} />
                </FormField>
            </div>

            <FormField label="Examples (one per line)">
                <TextareaInput
                    value={form.examples}
                    onChange={set('examples')}
                    placeholder={"His perseverance paid off.\nShe showed great perseverance."}
                />
            </FormField>

            <FormField label="Tags (comma separated)">
                <TextInput value={form.tags} onChange={set('tags')} placeholder="academic, IELTS, work" />
            </FormField>

            <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={onCancel} className="text-white/60">Cancel</Button>
                <Button type="submit" disabled={isPending || !form.word || !form.definition}
                    className="bg-blue-600 hover:bg-blue-700 text-white">
                    {isPending ? 'Saving…' : 'Save'}
                </Button>
            </div>
        </form>
    )
}

// ─── Word card ───────────────────────────────────────────────────────────────

function WordCard({ word }: { word: DictionaryWord }) {
    const [expanded, setExpanded] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const { mutate: update, isPending: isUpdating, error: updateError, reset: resetUpdate } = useWordUpdate()
    const { mutate: del, isPending: isDeleting } = useWordDelete()

    const accuracy = word.review_count > 0
        ? Math.round(word.correct_count / word.review_count * 100)
        : null

    return (
        <>
            <div className="bg-white/3 border border-white/5 rounded-lg overflow-hidden hover:border-white/10 transition-colors">
                <div className="p-4 flex items-start justify-between cursor-pointer" onClick={() => setExpanded(p => !p)}>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-semibold">{word.word}</span>
                            {word.phonetic && <span className="text-white/40 text-xs">{word.phonetic}</span>}
                            {word.part_of_speech && <span className="text-xs text-white/40 italic">{word.part_of_speech}</span>}
                        </div>
                        <p className="text-white/60 text-sm mt-0.5 line-clamp-1">{word.definition}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                        <span className={`text-xs border rounded px-1.5 py-0.5 ${DIFF_COLOR[word.difficulty] ?? 'text-white/40 border-white/10'}`}>
                            {word.difficulty}
                        </span>
                        {accuracy !== null && <span className="text-xs text-white/40">{accuracy}%</span>}
                        <button onClick={e => { e.stopPropagation(); setEditOpen(true) }}
                            className="p-1 text-white/30 hover:text-white hover:bg-white/10 rounded transition-all">
                            <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setDeleteOpen(true) }}
                            className="p-1 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                </div>

                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-2">
                                {word.translation && (
                                    <p className="text-sm text-blue-300/80">
                                        <span className="text-white/40 mr-1">Translation:</span>{word.translation}
                                    </p>
                                )}
                                {word.examples && word.examples.length > 0 && (
                                    <div>
                                        <p className="text-xs text-white/40 mb-1">Examples</p>
                                        <ul className="space-y-1">
                                            {word.examples.map((ex, i) => (
                                                <li key={i} className="text-sm text-white/60 pl-3 border-l border-white/10">{ex}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {word.tags && (
                                    <div className="flex gap-1.5 flex-wrap">
                                        {word.tags.split(',').map(t => (
                                            <span key={t} className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded">{t.trim()}</span>
                                        ))}
                                    </div>
                                )}
                                {word.review_count > 0 && (
                                    <p className="text-xs text-white/30">Reviewed {word.review_count}× · {accuracy}% correct</p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) resetUpdate() }}>
                <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-h-[90vh] overflow-y-auto max-w-lg">
                    <DialogHeader><DialogTitle className="text-white">Edit Word</DialogTitle></DialogHeader>
                    {updateError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
                            Could not save: {updateError.message}
                        </div>
                    )}
                    <WordForm
                        initial={{
                            word: word.word,
                            definition: word.definition,
                            translation: word.translation ?? '',
                            part_of_speech: word.part_of_speech ?? 'noun',
                            phonetic: word.phonetic ?? '',
                            examples: (word.examples ?? []).join('\n'),
                            difficulty: word.difficulty,
                            tags: word.tags ?? '',
                        }}
                        onSubmit={form => update(
                            { id: word.id, data: toWordPayload(form, word.module_id ?? 0) },
                            { onSuccess: () => { resetUpdate(); setEditOpen(false) } },
                        )}
                        isPending={isUpdating}
                        onCancel={() => { resetUpdate(); setEditOpen(false) }}
                    />
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent className="bg-[#0a0a0f] border border-white/10">
                    <AlertDialogTitle className="text-white">Delete &quot;{word.word}&quot;?</AlertDialogTitle>
                    <AlertDialogDescription className="text-white/60">This cannot be undone.</AlertDialogDescription>
                    <div className="flex justify-end gap-3 mt-6">
                        <AlertDialogCancel className="bg-white/5 border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => del(word.id, { onSuccess: () => setDeleteOpen(false) })}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >Delete</AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

// ─── Folder/module quick forms ───────────────────────────────────────────────

function FolderForm({
    initial = { name: '', color: FOLDER_COLORS[0].value },
    onSubmit,
    onCancel,
    isPending,
}: {
    initial?: { name: string; color: string }
    onSubmit: (data: { name: string; color: string }) => void
    onCancel: () => void
    isPending: boolean
}) {
    const [form, setForm] = useState(initial)
    return (
        <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="space-y-4">
            <FormField label="Folder name" required>
                <TextInput value={form.name} onChange={(v: string) => setForm(p => ({ ...p, name: v }))} placeholder="e.g. IELTS Vocabulary" />
            </FormField>
            <FormField label="Color">
                <div className="flex gap-2 flex-wrap">
                    {FOLDER_COLORS.map(c => (
                        <button
                            key={c.value}
                            type="button"
                            onClick={() => setForm(p => ({ ...p, color: c.value }))}
                            className={`w-8 h-8 rounded-full transition-all ${form.color === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1a1b26] scale-110' : 'opacity-70 hover:opacity-100'}`}
                            style={{ backgroundColor: c.value }}
                            aria-label={c.name}
                        />
                    ))}
                </div>
            </FormField>
            <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={onCancel} className="text-white/60">Cancel</Button>
                <Button type="submit" disabled={isPending || !form.name.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
                    {isPending ? 'Saving…' : 'Save'}
                </Button>
            </div>
        </form>
    )
}

function ModuleForm({
    initial = { name: '', description: '' },
    onSubmit,
    onCancel,
    isPending,
}: {
    initial?: { name: string; description: string }
    onSubmit: (data: { name: string; description: string }) => void
    onCancel: () => void
    isPending: boolean
}) {
    const [form, setForm] = useState(initial)
    return (
        <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="space-y-4">
            <FormField label="Module name" required>
                <TextInput value={form.name} onChange={(v: string) => setForm(p => ({ ...p, name: v }))} placeholder="e.g. Unit 1 — Travel" />
            </FormField>
            <FormField label="Description">
                <TextareaInput value={form.description} onChange={(v: string) => setForm(p => ({ ...p, description: v }))}
                    placeholder="Optional notes about this module" />
            </FormField>
            <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={onCancel} className="text-white/60">Cancel</Button>
                <Button type="submit" disabled={isPending || !form.name.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
                    {isPending ? 'Saving…' : 'Save'}
                </Button>
            </div>
        </form>
    )
}

// ─── Folders view ────────────────────────────────────────────────────────────

function FoldersView({ onOpen }: { onOpen: (folderId: number) => void }) {
    const { data: folders = [], isLoading } = useFolders()
    const { data: stats, isLoading: isStatsLoading } = useDictStats()
    const { mutate: createFolder, isPending: isCreating, error: createError, reset: resetCreate } = useFolderCreate()
    const { mutate: updateFolder, isPending: isUpdating, error: updateError, reset: resetUpdate } = useFolderUpdate()
    const { mutate: deleteFolder, isPending: isDeleting } = useFolderDelete()
    const [addOpen, setAddOpen] = useState(false)
    const [editFolder, setEditFolder] = useState<DictionaryFolder | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<DictionaryFolder | null>(null)

    return (
        <>
            <StatsPanel stats={stats} isLoading={isStatsLoading} scopeLabel="All your words" />
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white/80">Folders</h2>
                <Button onClick={() => setAddOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="w-4 h-4" /> New Folder
                </Button>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white/3 rounded-xl animate-pulse" />)}
                </div>
            ) : folders.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
                    <FolderIcon className="w-10 h-10 text-white/20 mx-auto mb-3" />
                    <p className="text-white/40 text-sm mb-4">No folders yet. Create your first one.</p>
                    <Button onClick={() => setAddOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="w-4 h-4" /> New Folder
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {folders.map(f => (
                        <div key={f.id} className="group relative bg-white/3 border border-white/5 rounded-xl p-4 hover:border-white/15 hover:bg-white/5 transition-all cursor-pointer"
                            onClick={() => onOpen(f.id)}>
                            <div className="flex items-start gap-3">
                                <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: `${f.color ?? '#6b7280'}33`, color: f.color ?? '#6b7280' }}
                                >
                                    <FolderIcon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-medium truncate">{f.name}</h3>
                                    <p className="text-xs text-white/40 mt-0.5">
                                        {f.module_count} module{f.module_count === 1 ? '' : 's'} · {f.word_count} word{f.word_count === 1 ? '' : 's'}
                                    </p>
                                </div>
                            </div>
                            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={e => { e.stopPropagation(); setEditFolder(f) }}
                                    className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-all">
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={e => { e.stopPropagation(); setConfirmDelete(f) }}
                                    className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded transition-all">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetCreate() }}>
                <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-w-md">
                    <DialogHeader><DialogTitle className="text-white">New Folder</DialogTitle></DialogHeader>
                    {createError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
                            Could not save: {createError.message}
                        </div>
                    )}
                    <FolderForm
                        onSubmit={data => createFolder(data, { onSuccess: () => { resetCreate(); setAddOpen(false) } })}
                        onCancel={() => { resetCreate(); setAddOpen(false) }}
                        isPending={isCreating}
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={!!editFolder} onOpenChange={(open) => { if (!open) { setEditFolder(null); resetUpdate() } }}>
                <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-w-md">
                    <DialogHeader><DialogTitle className="text-white">Edit Folder</DialogTitle></DialogHeader>
                    {updateError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
                            Could not save: {updateError.message}
                        </div>
                    )}
                    {editFolder && (
                        <FolderForm
                            initial={{ name: editFolder.name, color: editFolder.color ?? FOLDER_COLORS[0].value }}
                            onSubmit={data => updateFolder(
                                { id: editFolder.id, data },
                                { onSuccess: () => { resetUpdate(); setEditFolder(null) } },
                            )}
                            onCancel={() => { resetUpdate(); setEditFolder(null) }}
                            isPending={isUpdating}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}>
                <AlertDialogContent className="bg-[#0a0a0f] border border-white/10">
                    <AlertDialogTitle className="text-white">Delete &quot;{confirmDelete?.name}&quot;?</AlertDialogTitle>
                    <AlertDialogDescription className="text-white/60">
                        This will delete all modules and words inside it. This cannot be undone.
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-3 mt-6">
                        <AlertDialogCancel className="bg-white/5 border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => confirmDelete && deleteFolder(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >Delete</AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

// ─── Modules view ────────────────────────────────────────────────────────────

function ModulesView({
    folder, onOpenModule,
}: {
    folder: DictionaryFolder
    onOpenModule: (moduleId: number) => void
}) {
    const { data: modules = [], isLoading } = useModules(folder.id)
    const { data: stats, isLoading: isStatsLoading } = useDictStats({ folderId: folder.id })
    const { mutate: createModule, isPending: isCreating, error: createError, reset: resetCreate } = useModuleCreate()
    const { mutate: updateModule, isPending: isUpdating, error: updateError, reset: resetUpdate } = useModuleUpdate()
    const { mutate: deleteModule, isPending: isDeleting } = useModuleDelete()
    const [addOpen, setAddOpen] = useState(false)
    const [editModule, setEditModule] = useState<DictionaryModule | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<DictionaryModule | null>(null)

    return (
        <>
            <StatsPanel stats={stats} isLoading={isStatsLoading} scopeLabel={`Folder · ${folder.name}`} />
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-white/80">Modules</h2>
                    <p className="text-xs text-white/40 mt-0.5">in {folder.name}</p>
                </div>
                <Button onClick={() => setAddOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="w-4 h-4" /> New Module
                </Button>
            </div>

            {isLoading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-white/3 rounded-xl animate-pulse" />)}
                </div>
            ) : modules.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
                    <Layers className="w-10 h-10 text-white/20 mx-auto mb-3" />
                    <p className="text-white/40 text-sm mb-4">No modules in this folder yet.</p>
                    <Button onClick={() => setAddOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="w-4 h-4" /> New Module
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    {modules.map(m => (
                        <div key={m.id} className="group bg-white/3 border border-white/5 rounded-xl p-4 hover:border-white/15 hover:bg-white/5 transition-all cursor-pointer flex items-center gap-3"
                            onClick={() => onOpenModule(m.id)}>
                            <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                <BookOpen className="w-4 h-4 text-white/60" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-white font-medium truncate">{m.name}</h3>
                                {m.description && <p className="text-xs text-white/40 mt-0.5 line-clamp-1">{m.description}</p>}
                            </div>
                            <span className="text-xs text-white/40 shrink-0">{m.word_count} word{m.word_count === 1 ? '' : 's'}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                <button onClick={e => { e.stopPropagation(); setEditModule(m) }}
                                    className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-all">
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={e => { e.stopPropagation(); setConfirmDelete(m) }}
                                    className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded transition-all">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetCreate() }}>
                <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-w-md">
                    <DialogHeader><DialogTitle className="text-white">New Module</DialogTitle></DialogHeader>
                    {createError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
                            Could not save: {createError.message}
                        </div>
                    )}
                    <ModuleForm
                        onSubmit={data => createModule(
                            { folder_id: folder.id, name: data.name.trim(), description: data.description.trim() || undefined },
                            { onSuccess: () => { resetCreate(); setAddOpen(false) } },
                        )}
                        onCancel={() => { resetCreate(); setAddOpen(false) }}
                        isPending={isCreating}
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={!!editModule} onOpenChange={(open) => { if (!open) { setEditModule(null); resetUpdate() } }}>
                <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-w-md">
                    <DialogHeader><DialogTitle className="text-white">Edit Module</DialogTitle></DialogHeader>
                    {updateError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
                            Could not save: {updateError.message}
                        </div>
                    )}
                    {editModule && (
                        <ModuleForm
                            initial={{ name: editModule.name, description: editModule.description ?? '' }}
                            onSubmit={data => updateModule(
                                { id: editModule.id, data: { name: data.name.trim(), description: data.description.trim() || undefined } },
                                { onSuccess: () => { resetUpdate(); setEditModule(null) } },
                            )}
                            onCancel={() => { resetUpdate(); setEditModule(null) }}
                            isPending={isUpdating}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}>
                <AlertDialogContent className="bg-[#0a0a0f] border border-white/10">
                    <AlertDialogTitle className="text-white">Delete &quot;{confirmDelete?.name}&quot;?</AlertDialogTitle>
                    <AlertDialogDescription className="text-white/60">
                        All words in this module will be deleted. This cannot be undone.
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-3 mt-6">
                        <AlertDialogCancel className="bg-white/5 border-white/20 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => confirmDelete && deleteModule(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >Delete</AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

// ─── Words view ──────────────────────────────────────────────────────────────

function WordsView({ module: m }: { module: DictionaryModule }) {
    const [search, setSearch] = useState('')
    const [filterDiff, setFilterDiff] = useState('')
    const [addOpen, setAddOpen] = useState(false)

    const { data: words = [], isLoading } = useDictionaryWords({
        moduleId: m.id,
        search: search || undefined,
        difficulty: filterDiff || undefined,
    })
    const { data: stats, isLoading: isStatsLoading } = useDictStats({ moduleId: m.id })
    const { mutate: create, isPending: isCreating, error: createError, reset: resetCreate } = useWordCreate()

    return (
        <>
            <StatsPanel stats={stats} isLoading={isStatsLoading} scopeLabel={`Module · ${m.name}`} />
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-white/80">{m.name}</h2>
                    <p className="text-xs text-white/40 mt-0.5">
                        {words.length} word{words.length === 1 ? '' : 's'}
                        {m.description && ` · ${m.description}`}
                    </p>
                </div>
                <Button onClick={() => setAddOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="w-4 h-4" /> Add Word
                </Button>
            </div>

            <div className="flex gap-3 mb-6 flex-wrap">
                <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search words…"
                        className="w-full pl-9 pr-9 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/20"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <div className="flex gap-1.5">
                    <button onClick={() => setFilterDiff('')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filterDiff === '' ? 'bg-white/10 border-white/20 text-white' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>All</button>
                    {DIFFICULTIES.map(d => (
                        <button key={d}
                            onClick={() => setFilterDiff(d === filterDiff ? '' : d)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${filterDiff === d ? DIFF_COLOR[d] : 'border-white/10 text-white/40 hover:bg-white/5'}`}
                        >{d}</button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-3">
                    {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white/3 rounded-lg animate-pulse" />)}
                </div>
            ) : words.length === 0 ? (
                <div className="text-center py-16">
                    <p className="text-white/30 text-sm">
                        {search || filterDiff ? 'No words match your filters.' : 'No words yet. Add your first one!'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {words.map(w => <WordCard key={w.id} word={w} />)}
                </div>
            )}

            <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetCreate() }}>
                <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-h-[90vh] overflow-y-auto max-w-lg">
                    <DialogHeader><DialogTitle className="text-white">Add Word to {m.name}</DialogTitle></DialogHeader>
                    {createError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
                            Could not save: {createError.message}
                        </div>
                    )}
                    <WordForm
                        initial={emptyWordForm()}
                        onSubmit={form => create(toWordPayload(form, m.id), { onSuccess: () => { resetCreate(); setAddOpen(false) } })}
                        isPending={isCreating}
                        onCancel={() => { resetCreate(); setAddOpen(false) }}
                    />
                </DialogContent>
            </Dialog>
        </>
    )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DictionaryPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const search = useSearchParams()

    const folderIdRaw = search.get('folder')
    const moduleIdRaw = search.get('module')
    const folderId = folderIdRaw ? Number(folderIdRaw) : undefined
    const moduleId = moduleIdRaw ? Number(moduleIdRaw) : undefined

    const { data: folders = [] } = useFolders()
    const { data: modulesInFolder = [] } = useModules(folderId)

    const currentFolder = folderId ? folders.find(f => f.id === folderId) : undefined
    const currentModule = moduleId ? modulesInFolder.find(m => m.id === moduleId) : undefined

    const setUrl = (next: { folder?: number; module?: number }) => {
        const sp = new URLSearchParams()
        if (next.folder) sp.set('folder', String(next.folder))
        if (next.module) sp.set('module', String(next.module))
        const qs = sp.toString()
        router.push(`/platform/${params.id}/learning/dictionary${qs ? `?${qs}` : ''}`)
    }

    const goBack = () => {
        if (moduleId) setUrl({ folder: folderId })
        else if (folderId) setUrl({})
        else router.push(`/platform/${params.id}/learning`)
    }

    const breadcrumbTitle = currentModule
        ? currentModule.name
        : currentFolder
            ? currentFolder.name
            : 'Dictionary'

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-3xl mx-auto">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-8">
                    <button onClick={goBack}
                        className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-bold text-white truncate">{breadcrumbTitle}</h1>
                        <div className="flex items-center gap-1 text-xs text-white/40 mt-0.5">
                            <button onClick={() => setUrl({})} className="hover:text-white transition-colors">Dictionary</button>
                            {currentFolder && (
                                <>
                                    <span className="text-white/20">/</span>
                                    <button onClick={() => setUrl({ folder: currentFolder.id })} className="hover:text-white transition-colors truncate">
                                        {currentFolder.name}
                                    </button>
                                </>
                            )}
                            {currentModule && (
                                <>
                                    <span className="text-white/20">/</span>
                                    <span className="text-white/60 truncate">{currentModule.name}</span>
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>

                {!folderId && <FoldersView onOpen={(id) => setUrl({ folder: id })} />}
                {folderId && !moduleId && currentFolder && (
                    <ModulesView folder={currentFolder} onOpenModule={(id) => setUrl({ folder: folderId, module: id })} />
                )}
                {folderId && moduleId && currentModule && <WordsView module={currentModule} />}
                {folderId && !currentFolder && (
                    <div className="text-center py-16 text-white/40 text-sm">Folder not found.</div>
                )}
                {folderId && moduleId && !currentModule && (
                    <div className="text-center py-16 text-white/40 text-sm">Module not found.</div>
                )}
            </div>
        </div>
    )
}
