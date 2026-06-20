'use client'

import { useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { StatusBar, CommandGrid } from '@/components/hud'
import {
    ArrowLeft, Plus, Search, Trash2, Edit2, X, ChevronDown,
    Folder as FolderIcon, BookOpen, Layers, AlertCircle, Target, BookMarked,
    Sparkles, Dumbbell,
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
    useAiWordDetails, useAiGenerateModule,
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

// Retention bucket palette. Fragile leads — the "struggle" axis is
// independent of interval, so a long-interval word the learner keeps
// failing belongs here instead of mastered. The other three are an
// interval-strength axis: learning (≤ 7d) → solid (≤ 21d) → mastered.
//
// Fragile uses rose to flag attention; learning is amber (in-flight);
// solid is blue (mid-strength); mastered is emerald (done). Labels +
// help text mirror the backend bucket_expr / is_fragile semantics so
// the UI legend is the same source of truth as the scheduler.
const BUCKETS: { key: 'fragile' | 'learning' | 'solid' | 'mastered'; label: string; bar: string; dot: string; help: string }[] = [
    { key: 'fragile', label: 'Fragile', bar: 'bg-rose-400', dot: 'bg-rose-400', help: 'Struggle: 2+ lapses or low ease' },
    { key: 'learning', label: 'Learning', bar: 'bg-cyan-400', dot: 'bg-cyan-400', help: 'Interval ≤ 7 days (incl. new)' },
    { key: 'solid', label: 'Solid', bar: 'bg-blue-400', dot: 'bg-blue-400', help: 'Interval 8–21 days' },
    { key: 'mastered', label: 'Mastered', bar: 'bg-emerald-400', dot: 'bg-emerald-400', help: 'Interval > 21 days' },
]

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
            className="mb-6 bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-white/10 rounded-2xl p-3 sm:p-5 space-y-4 sm:space-y-5"
        >
            <div className="flex items-baseline justify-between">
                <h3 className="text-xs uppercase tracking-wider text-white/40 font-medium">{scopeLabel}</h3>
                {stats.needs_review_total > 0 && (
                    <span className="text-xs text-rose-300/80 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {stats.needs_review_total} need{stats.needs_review_total === 1 ? 's' : ''} review
                    </span>
                )}
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4">
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
                            : stats.accuracy >= 60 ? 'text-cyan-300'
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

            {stats.buckets && (
                <div>
                    <p className="text-xs text-white/40 mb-2">Retention</p>
                    <div
                        className="flex h-2 rounded-full overflow-hidden bg-white/5"
                        title="Per-card SR state: new → learning → young → mature"
                    >
                        {BUCKETS.map(b => {
                            const n = stats.buckets[b.key] ?? 0
                            if (n === 0) return null
                            return (
                                <div
                                    key={b.key}
                                    className={b.bar}
                                    style={{ width: `${(n / stats.total) * 100}%` }}
                                    title={`${b.label}: ${n} — ${b.help}`}
                                />
                            )
                        })}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
                        {BUCKETS.map(b => {
                            const n = stats.buckets[b.key] ?? 0
                            return (
                                <span key={b.key} className="text-white/60" title={b.help}>
                                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${b.dot}`} />
                                    {b.label} <span className="text-white/40">{n}</span>
                                </span>
                            )
                        })}
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
        <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-white/40 text-[10px] sm:text-xs mb-1">
                <Icon className="w-3 h-3 shrink-0" />
                <span className="truncate">{label}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
                <span className={`text-lg sm:text-2xl font-bold tabular-nums ${accent}`}>{value}</span>
                {sub && <span className="text-[10px] sm:text-xs text-white/40">{sub}</span>}
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
    examples: '', difficulty: '', tags: '',
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
    const [aiFilled, setAiFilled] = useState<Set<keyof WordFormData>>(new Set())
    const set = (field: keyof WordFormData) => (v: string) => {
        setForm(p => ({ ...p, [field]: v }))
        // Once the user edits a field, it's no longer "AI-set".
        setAiFilled(prev => {
            if (!prev.has(field)) return prev
            const next = new Set(prev)
            next.delete(field)
            return next
        })
    }
    const { mutate: aiFill, isPending: isAiLoading, error: aiError, reset: resetAi } = useAiWordDetails()

    const handleAiFill = () => {
        const w = form.word.trim()
        if (!w) return
        resetAi()
        aiFill(w, {
            onSuccess: (data) => {
                const filled = new Set<keyof WordFormData>()
                setForm(p => {
                    const next = { ...p }
                    if (data.definition) { next.definition = data.definition; filled.add('definition') }
                    if (data.translation) { next.translation = data.translation; filled.add('translation') }
                    if (data.phonetic) { next.phonetic = data.phonetic; filled.add('phonetic') }
                    if (data.part_of_speech) { next.part_of_speech = data.part_of_speech; filled.add('part_of_speech') }
                    if (data.difficulty) { next.difficulty = data.difficulty; filled.add('difficulty') }
                    if (data.examples?.length) { next.examples = data.examples.join('\n'); filled.add('examples') }
                    return next
                })
                setAiFilled(filled)
            },
        })
    }

    const aiBadge = '✨ AI'
    const desc = (k: keyof WordFormData) => aiFilled.has(k) ? aiBadge : undefined

    const missingDifficulty = !form.difficulty
    const difficultyTriggerClass = form.difficulty
        ? `${DIFF_COLOR[form.difficulty] ?? 'bg-[#0f0f1a] border-[#2a2b36] text-white'} font-semibold`
        : 'bg-[#0f0f1a] border-rose-500/40 text-rose-300/70'

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (missingDifficulty) return
        onSubmit(form)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <FormField label="Word" required>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <TextInput value={form.word} onChange={set('word')} placeholder="e.g. Perseverance" />
                        </div>
                        <button
                            type="button"
                            onClick={handleAiFill}
                            disabled={!form.word.trim() || isAiLoading}
                            title="Auto-fill with AI"
                            className="shrink-0 px-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 text-sm"
                        >
                            <Sparkles className={`w-4 h-4 ${isAiLoading ? 'animate-pulse' : ''}`} />
                            {isAiLoading ? '...' : 'AI'}
                        </button>
                    </div>
                </FormField>
                <FormField label="Phonetic" description={desc('phonetic')}>
                    <TextInput value={form.phonetic} onChange={set('phonetic')} placeholder="/ˌpɜː.sɪˈvɪər.əns/" />
                </FormField>
            </div>

            {aiError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-xs text-rose-300">
                    AI fill failed: {aiError.message}
                </div>
            )}

            {aiFilled.size > 0 && (
                <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-2.5 text-xs text-indigo-300 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI filled {aiFilled.size} field{aiFilled.size === 1 ? '' : 's'}. Edit anything to override.
                </div>
            )}

            <FormField label="Definition" required description={desc('definition')}>
                <TextareaInput value={form.definition} onChange={set('definition')} placeholder="Continued effort despite difficulties..." />
            </FormField>

            <FormField label="Translation (Uzbek / Russian)" description={desc('translation')}>
                <TextInput value={form.translation} onChange={set('translation')} placeholder="e.g. Qat'iyat / Настойчивость" />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
                <FormField label="Part of Speech" description={desc('part_of_speech')}>
                    <SelectInput value={form.part_of_speech} onChange={set('part_of_speech')} options={POS_OPTIONS} />
                </FormField>
                <FormField
                    label="Difficulty"
                    required
                    description={desc('difficulty') ?? (missingDifficulty ? 'Pick a level or click AI' : undefined)}
                >
                    <SelectInput
                        value={form.difficulty}
                        onChange={set('difficulty')}
                        placeholder="AI or pick manually"
                        triggerClassName={difficultyTriggerClass}
                        options={DIFFICULTIES.map(d => ({ value: d, label: d }))}
                    />
                </FormField>
            </div>

            <FormField label="Examples (one per line)" description={desc('examples')}>
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
                <Button type="submit" disabled={isPending || !form.word || !form.definition || missingDifficulty}
                    className="bg-blue-600 hover:bg-blue-700 text-white">
                    {isPending ? 'Saving…' : 'Save'}
                </Button>
            </div>
        </form>
    )
}

// ─── Word card ───────────────────────────────────────────────────────────────

// Render the saved sentence with the target word emphasized inline. The
// emphasis is whole-word matched (`\bword\b`) and case-insensitive so an
// inflected form like "running" still bolds the "run" stem only when it
// actually appears; otherwise the sentence renders plain. We deliberately
// avoid stemming — bolding the wrong span is more confusing than no bold.
function HighlightedSentence({ sentence, word }: { sentence: string; word: string }) {
    const target = word.trim()
    if (!target) return <>{sentence}</>
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
        const parts = sentence.split(new RegExp(`(\\b${escaped}\\b)`, 'i'))
        return (
            <>
                {parts.map((p, i) =>
                    i % 2 === 1
                        ? <mark key={i} className="bg-indigo-500/20 text-indigo-200 rounded px-0.5">{p}</mark>
                        : <span key={i}>{p}</span>
                )}
            </>
        )
    } catch {
        return <>{sentence}</>
    }
}

function SourceBlock({ word, onJump }: { word: DictionaryWord; onJump: () => void }) {
    const hasBook = !!word.source_book_id
    const bookLabel = word.source_book_title || (hasBook ? `Book #${word.source_book_id}` : null)
    return (
        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.04] p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-indigo-300/80 min-w-0">
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                        {bookLabel ? `From ${bookLabel}` : 'From your reading'}
                        {word.source_page ? ` · p. ${word.source_page}` : ''}
                    </span>
                </div>
                {hasBook && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onJump() }}
                        className="shrink-0 text-xs px-2 py-1 rounded-md border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 transition-colors"
                    >
                        Open
                    </button>
                )}
            </div>
            {word.source_sentence && (
                <p className="text-sm text-white/75 leading-snug italic">
                    &ldquo;<HighlightedSentence sentence={word.source_sentence} word={word.word} />&rdquo;
                </p>
            )}
        </div>
    )
}

function WordCard({ word }: { word: DictionaryWord }) {
    const [expanded, setExpanded] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const { mutate: update, isPending: isUpdating, error: updateError, reset: resetUpdate } = useWordUpdate()
    const { mutate: del, isPending: isDeleting } = useWordDelete()
    const router = useRouter()
    const params = useParams<{ id: string }>()

    const jumpToSource = () => {
        if (!word.source_book_id) return
        const q = word.source_page ? `?page=${word.source_page}` : ''
        router.push(`/platform/${params.id}/learning/library/${word.source_book_id}${q}`)
    }

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
                                {(word.source_book_id || word.source_sentence) && (
                                    <SourceBlock word={word} onJump={jumpToSource} />
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
                                {word.tags && !/^book:\d+\|page:\d+$/.test(word.tags) && (
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
    const { mutate: aiGenerateModule, isPending: isAiGenerating, error: aiGenerateError, reset: resetAiGenerate } = useAiGenerateModule()
    const [aiOpen, setAiOpen] = useState(false)
    const { mutate: updateModule, isPending: isUpdating, error: updateError, reset: resetUpdate } = useModuleUpdate()
    const { mutate: deleteModule, isPending: isDeleting } = useModuleDelete()
    const [addOpen, setAddOpen] = useState(false)
    const [editModule, setEditModule] = useState<DictionaryModule | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<DictionaryModule | null>(null)

    return (
        <>
            <StatsPanel stats={stats} isLoading={isStatsLoading} scopeLabel={`Folder · ${folder.name}`} />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-white/80">Modules</h2>
                    <p className="text-xs text-white/40 mt-0.5 truncate">in {folder.name}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setAiOpen(true)} variant="outline"
                        className="gap-2 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10">
                        <Sparkles className="w-4 h-4" />
                        <span className="hidden sm:inline">Generate with AI</span>
                        <span className="sm:hidden">AI</span>
                    </Button>
                    <Button onClick={() => setAddOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">New Module</span>
                        <span className="sm:hidden">New</span>
                    </Button>
                </div>
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

            <Dialog open={aiOpen} onOpenChange={(open) => { setAiOpen(open); if (!open) resetAiGenerate() }}>
                <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-w-md">
                    <DialogHeader><DialogTitle className="text-white">Generate Module with AI</DialogTitle></DialogHeader>
                    {aiGenerateError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
                            {aiGenerateError.message}
                        </div>
                    )}
                    <AiModuleForm
                        folderId={folder.id}
                        onCancel={() => { resetAiGenerate(); setAiOpen(false) }}
                        onSubmit={(payload) => aiGenerateModule(payload, {
                            onSuccess: () => { resetAiGenerate(); setAiOpen(false) },
                        })}
                        isPending={isAiGenerating}
                    />
                </DialogContent>
            </Dialog>
        </>
    )
}

function AiModuleForm({ folderId, onSubmit, onCancel, isPending }: {
    folderId: number
    onSubmit: (data: { folder_id: number; topic: string; level: string; count: number; module_name?: string }) => void
    onCancel: () => void
    isPending: boolean
}) {
    const [topic, setTopic] = useState('')
    const [moduleName, setModuleName] = useState('')
    const [level, setLevel] = useState('B1')
    const [count, setCount] = useState(15)

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit({
                    folder_id: folderId,
                    topic: topic.trim(),
                    level,
                    count,
                    module_name: moduleName.trim() || undefined,
                })
            }}
            className="space-y-4"
        >
            <FormField label="Topic" required>
                <TextInput value={topic} onChange={(v: string) => setTopic(v)}
                    placeholder="e.g. Travel, IELTS academic verbs, Business meetings" />
            </FormField>

            <FormField label="Module name (optional)">
                <TextInput value={moduleName} onChange={(v: string) => setModuleName(v)}
                    placeholder="Defaults to the topic" />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
                <FormField label="Level">
                    <SelectInput
                        value={level}
                        onChange={setLevel}
                        options={DIFFICULTIES.map(d => ({ value: d, label: d }))}
                    />
                </FormField>
                <FormField label="Number of words">
                    <SelectInput
                        value={String(count)}
                        onChange={(v) => setCount(Number(v))}
                        options={[5, 10, 15, 20, 25, 30].map(n => ({ value: String(n), label: String(n) }))}
                    />
                </FormField>
            </div>

            <p className="text-xs text-white/40">
                AI will create a new module in this folder and fill it with {count} words at level {level}.
                This usually takes 5-15 seconds.
            </p>

            <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={onCancel} className="text-white/60">Cancel</Button>
                <Button type="submit"
                    disabled={isPending || !topic.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                    <Sparkles className={`w-4 h-4 ${isPending ? 'animate-pulse' : ''}`} />
                    {isPending ? 'Generating…' : 'Generate'}
                </Button>
            </div>
        </form>
    )
}

// ─── Words view ──────────────────────────────────────────────────────────────

function WordsView({ module: m }: { module: DictionaryModule }) {
    const router = useRouter()
    const params = useParams<{ id: string }>()
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

    // Module-scoped practice: take the user straight into a session that
    // only uses this module's words. The practice page reads
    // ?folder=…&module=… on mount and pre-selects the scope.
    const practiceHref = `/platform/${params.id}/learning/practice?folder=${m.folder_id}&module=${m.id}`
    const canPractice = (stats?.total ?? 0) >= 2

    return (
        <>
            <StatsPanel stats={stats} isLoading={isStatsLoading} scopeLabel={`Module · ${m.name}`} />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-white/80 truncate">{m.name}</h2>
                    <p className="text-xs text-white/40 mt-0.5 line-clamp-2">
                        {words.length} word{words.length === 1 ? '' : 's'}
                        {m.description && ` · ${m.description}`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => router.push(practiceHref)}
                        disabled={!canPractice}
                        title={canPractice ? 'Practice this module' : 'Add at least 2 words to practice'}
                        className="gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/30 disabled:cursor-not-allowed text-white"
                    >
                        <Dumbbell className="w-4 h-4" /> Practice
                    </Button>
                    <Button onClick={() => setAddOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Add Word</span>
                        <span className="sm:hidden">Add</span>
                    </Button>
                </div>
            </div>

            <div className="flex gap-2 sm:gap-3 mb-6 flex-wrap">
                <div className="relative flex-1 min-w-[12rem]">
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
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            <CommandGrid className="max-w-3xl mx-auto">
                <StatusBar section="Dictionary" chips={[{ label: 'ONLINE', active: true }]} />
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 sm:gap-4 mb-6 sm:mb-8">
                    <button onClick={goBack}
                        className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-all shrink-0">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{breadcrumbTitle}</h1>
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
            </CommandGrid>
        </div>
    )
}
