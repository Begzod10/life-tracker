'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Plus, Search, Trash2, Edit2, X, Check, ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useDictionaryWords, useWordCreate, useWordUpdate, useWordDelete, type DictionaryWord, type WordCreate } from '@/lib/hooks/use-dictionary'
import { FormField, TextInput, TextareaInput, SelectInput } from '@/components/modals/form-components'

const DIFFICULTIES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const POS_OPTIONS = [
    { value: '', label: 'Any' },
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

const emptyForm = (): WordFormData => ({
    word: '', definition: '', translation: '',
    part_of_speech: 'noun', phonetic: '',
    examples: '', difficulty: 'B1', tags: '',
})

function toApiPayload(f: WordFormData): WordCreate {
    return {
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
    onSubmit: (data: WordCreate) => void
    isPending: boolean
    onCancel: () => void
}) {
    const [form, setForm] = useState(initial)
    const set = (field: keyof WordFormData) => (v: string) => setForm(p => ({ ...p, [field]: v }))

    return (
        <form onSubmit={e => { e.preventDefault(); onSubmit(toApiPayload(form)) }} className="space-y-4">
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
                    <SelectInput value={form.part_of_speech} onChange={set('part_of_speech')}
                        options={POS_OPTIONS.filter(o => o.value)} />
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

function WordCard({ word }: { word: DictionaryWord }) {
    const [expanded, setExpanded] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const { mutate: update, isPending: isUpdating } = useWordUpdate()
    const { mutate: del, isPending: isDeleting } = useWordDelete()

    const accuracy = word.review_count > 0
        ? Math.round(word.correct_count / word.review_count * 100)
        : null

    return (
        <>
            <div className="bg-white/3 border border-white/5 rounded-lg overflow-hidden hover:border-white/10 transition-colors">
                <div
                    className="p-4 flex items-start justify-between cursor-pointer"
                    onClick={() => setExpanded(p => !p)}
                >
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-semibold">{word.word}</span>
                            {word.phonetic && (
                                <span className="text-white/40 text-xs">{word.phonetic}</span>
                            )}
                            {word.part_of_speech && (
                                <span className="text-xs text-white/40 italic">{word.part_of_speech}</span>
                            )}
                        </div>
                        <p className="text-white/60 text-sm mt-0.5 line-clamp-1">{word.definition}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                        <span className={`text-xs border rounded px-1.5 py-0.5 ${DIFF_COLOR[word.difficulty] ?? 'text-white/40 border-white/10'}`}>
                            {word.difficulty}
                        </span>
                        {accuracy !== null && (
                            <span className="text-xs text-white/40">{accuracy}%</span>
                        )}
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
                                    <p className="text-xs text-white/30">
                                        Reviewed {word.review_count}× · {accuracy}% correct
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Edit dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-h-[90vh] overflow-y-auto max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-white">Edit Word</DialogTitle>
                    </DialogHeader>
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
                        onSubmit={data => update({ id: word.id, data }, { onSuccess: () => setEditOpen(false) })}
                        isPending={isUpdating}
                        onCancel={() => setEditOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            {/* Delete confirmation */}
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
                        >
                            Delete
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

export default function DictionaryPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [filterDiff, setFilterDiff] = useState('')
    const [addOpen, setAddOpen] = useState(false)

    const { data: words = [], isLoading } = useDictionaryWords(search || undefined, filterDiff || undefined)
    const { mutate: create, isPending: isCreating } = useWordCreate()

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-8">
                    <button onClick={() => router.push(`/platform/${params.id}/learning`)}
                        className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold text-white">Dictionary</h1>
                        <p className="text-sm text-white/50">{words.length} words</p>
                    </div>
                    <Button onClick={() => setAddOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="w-4 h-4" /> Add Word
                    </Button>
                </motion.div>

                {/* Filters */}
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
                        <button
                            onClick={() => setFilterDiff('')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filterDiff === '' ? 'bg-white/10 border-white/20 text-white' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
                        >All</button>
                        {DIFFICULTIES.map(d => (
                            <button key={d}
                                onClick={() => setFilterDiff(d === filterDiff ? '' : d)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${filterDiff === d ? DIFF_COLOR[d] : 'border-white/10 text-white/40 hover:bg-white/5'}`}
                            >{d}</button>
                        ))}
                    </div>
                </div>

                {/* Word list */}
                {isLoading ? (
                    <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-16 bg-white/3 rounded-lg animate-pulse" />
                        ))}
                    </div>
                ) : words.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-white/30 text-sm">
                            {search || filterDiff ? 'No words match your filters.' : 'No words yet. Add your first one!'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {words.map(word => <WordCard key={word.id} word={word} />)}
                    </div>
                )}
            </div>

            {/* Add Word dialog */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="bg-[#1a1b26] border border-[#2a2b36] max-h-[90vh] overflow-y-auto max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-white">Add Word</DialogTitle>
                    </DialogHeader>
                    <WordForm
                        initial={emptyForm()}
                        onSubmit={data => create(data, { onSuccess: () => setAddOpen(false) })}
                        isPending={isCreating}
                        onCancel={() => setAddOpen(false)}
                    />
                </DialogContent>
            </Dialog>
        </div>
    )
}
