'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, FileText, Sparkles, Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    useFolders, useModules, useWordCreate, useAiExtractVocab,
    type AiExtractCandidate, type DictionaryFolder, type DictionaryModule,
} from '@/lib/hooks/use-dictionary'
import { FormField, SelectInput, TextareaInput } from '@/components/modals/form-components'

const DIFFICULTIES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const DIFF_COLOR: Record<string, string> = {
    A1: 'bg-green-500/15 text-green-400 border-green-500/20',
    A2: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    B1: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    B2: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
    C1: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    C2: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
}

export default function ReadingPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [text, setText] = useState('')
    const [level, setLevel] = useState('B1')
    const [maxWords, setMaxWords] = useState(15)
    const [candidates, setCandidates] = useState<AiExtractCandidate[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set())

    const [folderId, setFolderId] = useState<number | undefined>(undefined)
    const [moduleId, setModuleId] = useState<number | undefined>(undefined)

    const { data: folders = [] } = useFolders()
    const { data: modules = [] } = useModules(folderId)

    const { mutate: extract, isPending: isExtracting, error: extractError, reset: resetExtract } = useAiExtractVocab()
    const { mutate: createWord, isPending: isSaving } = useWordCreate()

    const candidateKey = (c: AiExtractCandidate) => c.word.toLowerCase()

    const allSelectable = useMemo(
        () => candidates.filter(c => !savedKeys.has(candidateKey(c))),
        [candidates, savedKeys],
    )

    const handleExtract = () => {
        resetExtract()
        setSelected(new Set())
        setSavedKeys(new Set())
        extract(
            { text: text.trim(), level, max_words: maxWords },
            { onSuccess: (data) => setCandidates(data.candidates) },
        )
    }

    const toggle = (c: AiExtractCandidate) => {
        const k = candidateKey(c)
        if (savedKeys.has(k)) return
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(k)) next.delete(k)
            else next.add(k)
            return next
        })
    }

    const toggleAll = () => {
        if (selected.size === allSelectable.length) {
            setSelected(new Set())
        } else {
            setSelected(new Set(allSelectable.map(candidateKey)))
        }
    }

    const saveSelected = () => {
        if (!moduleId) return
        const items = candidates.filter(c => selected.has(candidateKey(c)))
        if (items.length === 0) return

        let remaining = items.length
        items.forEach(c => {
            createWord(
                {
                    module_id: moduleId,
                    word: c.word,
                    definition: c.definition,
                    translation: c.translation || undefined,
                    phonetic: c.phonetic || undefined,
                    part_of_speech: c.part_of_speech || undefined,
                    difficulty: c.difficulty,
                    examples: c.examples?.length ? c.examples : undefined,
                },
                {
                    onSuccess: () => {
                        setSavedKeys(prev => new Set(prev).add(candidateKey(c)))
                        setSelected(prev => {
                            const next = new Set(prev)
                            next.delete(candidateKey(c))
                            return next
                        })
                    },
                    onSettled: () => { remaining-- },
                },
            )
        })
    }

    const currentModule = modules.find(m => m.id === moduleId)

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-3xl mx-auto">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-8">
                    <button onClick={() => router.push(`/platform/${params.id}/learning`)}
                        className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold text-white">Reading</h1>
                        <p className="text-sm text-white/50">Paste a passage and AI extracts useful vocabulary at your level.</p>
                    </div>
                </motion.div>

                <div className="space-y-5 mb-8">
                    <FormField label="Paste text">
                        <TextareaInput
                            value={text}
                            onChange={(v: string) => setText(v)}
                            placeholder="Paste an article, paragraph, or passage you've been reading…"
                        />
                    </FormField>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Your level">
                            <SelectInput
                                value={level}
                                onChange={setLevel}
                                options={DIFFICULTIES.map(d => ({ value: d, label: d }))}
                            />
                        </FormField>
                        <FormField label="Max words to extract">
                            <SelectInput
                                value={String(maxWords)}
                                onChange={(v) => setMaxWords(Number(v))}
                                options={[5, 10, 15, 20, 25, 30].map(n => ({ value: String(n), label: String(n) }))}
                            />
                        </FormField>
                    </div>

                    {extractError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
                            {extractError.message}
                        </div>
                    )}

                    <Button
                        onClick={handleExtract}
                        disabled={!text.trim() || text.trim().length < 10 || isExtracting}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2 py-3 text-base"
                    >
                        <Sparkles className={`w-4 h-4 ${isExtracting ? 'animate-pulse' : ''}`} />
                        {isExtracting ? 'Mining vocabulary…' : 'Extract words'}
                    </Button>
                </div>

                {candidates.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4 bg-white/[0.02] border border-white/5 rounded-2xl p-5"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm uppercase tracking-wider text-white/50 font-medium">
                                {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
                            </h2>
                            <button onClick={toggleAll} className="text-xs text-indigo-300 hover:text-indigo-200">
                                {selected.size === allSelectable.length ? 'Deselect all' : 'Select all'}
                            </button>
                        </div>

                        <div className="space-y-2">
                            {candidates.map((c) => {
                                const k = candidateKey(c)
                                const saved = savedKeys.has(k)
                                const isSelected = selected.has(k)
                                return (
                                    <div
                                        key={k}
                                        onClick={() => toggle(c)}
                                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                                            saved
                                                ? 'border-green-500/30 bg-green-500/5 cursor-default'
                                                : isSelected
                                                    ? 'border-indigo-500/40 bg-indigo-500/5'
                                                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                                saved
                                                    ? 'border-green-400 bg-green-500'
                                                    : isSelected
                                                        ? 'border-indigo-400 bg-indigo-500'
                                                        : 'border-white/20'
                                            }`}>
                                                {(saved || isSelected) && <Check className="w-3 h-3 text-white" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-white font-medium">{c.word}</span>
                                                    {c.phonetic && <span className="text-white/40 text-xs">{c.phonetic}</span>}
                                                    <span className={`text-[10px] border rounded px-1.5 py-0.5 ${DIFF_COLOR[c.difficulty] ?? 'text-white/40 border-white/10'}`}>
                                                        {c.difficulty}
                                                    </span>
                                                    {c.part_of_speech && <span className="text-xs text-white/40 italic">{c.part_of_speech}</span>}
                                                    {saved && <span className="text-xs text-green-400">saved</span>}
                                                </div>
                                                <p className="text-sm text-white/60 mt-1">{c.definition}</p>
                                                {c.translation && <p className="text-xs text-blue-300/60 mt-0.5">{c.translation}</p>}
                                                {c.examples?.[0] && (
                                                    <p className="text-xs text-white/40 italic mt-1">&ldquo;{c.examples[0]}&rdquo;</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="border-t border-white/5 pt-4 space-y-3">
                            <p className="text-xs text-white/40">Save selected words to:</p>
                            <div className="grid grid-cols-2 gap-3">
                                <FormField label="Folder">
                                    <SelectInput
                                        value={folderId ? String(folderId) : ''}
                                        onChange={(v) => { setFolderId(v ? Number(v) : undefined); setModuleId(undefined) }}
                                        options={[
                                            { value: '', label: 'Pick a folder…' },
                                            ...folders.map((f: DictionaryFolder) => ({ value: String(f.id), label: f.name })),
                                        ]}
                                    />
                                </FormField>
                                <FormField label="Module">
                                    <SelectInput
                                        value={moduleId ? String(moduleId) : ''}
                                        onChange={(v) => setModuleId(v ? Number(v) : undefined)}
                                        options={[
                                            { value: '', label: folderId ? 'Pick a module…' : 'Pick a folder first' },
                                            ...modules.map((m: DictionaryModule) => ({ value: String(m.id), label: m.name })),
                                        ]}
                                    />
                                </FormField>
                            </div>
                            <Button
                                onClick={saveSelected}
                                disabled={!moduleId || selected.size === 0 || isSaving}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                {isSaving
                                    ? 'Saving…'
                                    : `Save ${selected.size} word${selected.size === 1 ? '' : 's'}${currentModule ? ` to ${currentModule.name}` : ''}`}
                            </Button>
                        </div>
                    </motion.div>
                )}

                {candidates.length === 0 && !isExtracting && (
                    <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl">
                        <FileText className="w-10 h-10 text-white/20 mx-auto mb-3" />
                        <p className="text-white/40 text-sm">Paste a passage above and click Extract.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
