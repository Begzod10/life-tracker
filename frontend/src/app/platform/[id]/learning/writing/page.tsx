'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { StatusBar, CommandGrid } from '@/components/hud'
import { ArrowLeft, PenLine, Sparkles, Plus, Trash2, Clock, Target as TargetIcon, TrendingUp, AlertCircle, BookOpen, FileQuestion, Search, PencilLine } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FormField, SelectInput, TextInput, TextareaInput } from '@/components/modals/form-components'
import {
    useEssays, useEssayCreate, useEssayDelete, useEssayPrompt, useEssayDrillsSummary,
    type EssayLevel,
    type EssayExistingTopicRef,
} from '@/lib/hooks/use-essays'

const LEVELS: EssayLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const LEVEL_COLOR: Record<string, string> = {
    A1: 'text-green-400', A2: 'text-emerald-400',
    B1: 'text-blue-400', B2: 'text-indigo-400',
    C1: 'text-purple-400', C2: 'text-rose-400',
}

export default function WritingListPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [showNew, setShowNew] = useState(false)
    const [level, setLevel] = useState<EssayLevel>('B1')
    const [hint, setHint] = useState('')
    const [useWeak, setUseWeak] = useState(true)
    const [customPrompt, setCustomPrompt] = useState('')
    const [generatedPrompt, setGeneratedPrompt] = useState<{ prompt: string; target_words: string[]; suggested_word_count: number } | null>(null)
    const [existingMatch, setExistingMatch] = useState<EssayExistingTopicRef | null>(null)
    const [error, setError] = useState<string | null>(null)

    const { data: essays = [], isLoading } = useEssays()
    const { data: drillSummary } = useEssayDrillsSummary()
    const { mutate: gen, isPending: generating } = useEssayPrompt()
    const { mutate: createEssay, isPending: creating } = useEssayCreate()
    const { mutate: del } = useEssayDelete()

    const drafts = essays.filter(e => e.status === 'draft')
    const submitted = essays.filter(e => e.status === 'submitted')

    const handleGenerate = () => {
        setError(null)
        setExistingMatch(null)
        gen(
            { level, topic_hint: hint || undefined, use_weak_words: useWeak },
            {
                onSuccess: (data) => {
                    setGeneratedPrompt({
                        prompt: data.prompt,
                        target_words: data.target_words,
                        suggested_word_count: data.suggested_word_count,
                    })
                    setExistingMatch(data.existing_essay ?? null)
                },
                onError: (e) => setError(e.message),
            },
        )
    }

    const handleStartEssay = (prompt: string, targets: string[], wordCount: number) => {
        setError(null)
        createEssay(
            { prompt, level, target_words: targets, target_word_count: wordCount },
            {
                onSuccess: (essay: { id: number }) =>
                    router.push(`/platform/${params.id}/learning/writing/${essay.id}`),
                onError: (e) => setError(e.message),
            },
        )
    }

    const handleOpenExisting = (essayId: number) => {
        router.push(`/platform/${params.id}/learning/writing/${essayId}`)
    }

    return (
        <CommandGrid className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-5xl mx-auto">
                <StatusBar section="Writing" />
                <button
                    onClick={() => router.push(`/platform/${params.id}/learning`)}
                    className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Back to Learning</span>
                </button>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2 sm:gap-3">
                            <PenLine className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" />
                            Writing
                        </h1>
                        <p className="text-white/50 mt-1 text-sm">Write essays, get AI feedback at your CEFR level.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => router.push(`/platform/${params.id}/learning/writing/drills`)}
                            className="relative text-white/70 hover:text-white border border-white/10"
                        >
                            <TargetIcon className="w-4 h-4 mr-2" />
                            Drills
                            {drillSummary && drillSummary.due > 0 && (
                                <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/30">
                                    {drillSummary.due > 99 ? '99+' : drillSummary.due}
                                </span>
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => router.push(`/platform/${params.id}/learning/writing/progress`)}
                            className="text-white/70 hover:text-white border border-white/10"
                        >
                            <TrendingUp className="w-4 h-4 mr-2" />
                            Progress
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => router.push(`/platform/${params.id}/learning/writing/ielts`)}
                            className="text-indigo-300/70 hover:text-indigo-200 border border-indigo-500/20 bg-indigo-500/5"
                        >
                            <Sparkles className="w-4 h-4 mr-2" />
                            IELTS Task 2
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => router.push(`/platform/${params.id}/learning/writing/paraphrase`)}
                            className="text-amber-300/70 hover:text-amber-200 border border-amber-500/20 bg-amber-500/5"
                        >
                            <BookOpen className="w-4 h-4 mr-2" />
                            Paraphrase
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => router.push(`/platform/${params.id}/learning/writing/gap-fill`)}
                            className="text-emerald-300/70 hover:text-emerald-200 border border-emerald-500/20 bg-emerald-500/5"
                        >
                            <FileQuestion className="w-4 h-4 mr-2" />
                            Gap Fill
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => router.push(`/platform/${params.id}/learning/writing/error-hunt`)}
                            className="text-rose-300/70 hover:text-rose-200 border border-rose-500/20 bg-rose-500/5"
                        >
                            <Search className="w-4 h-4 mr-2" />
                            Error Hunt
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => router.push(`/platform/${params.id}/learning/writing/mini-build`)}
                            className="text-violet-300/70 hover:text-violet-200 border border-violet-500/20 bg-violet-500/5"
                        >
                            <PencilLine className="w-4 h-4 mr-2" />
                            Mini Build
                        </Button>
                        <Button
                            onClick={() => { setShowNew(true); setGeneratedPrompt(null); setExistingMatch(null); setError(null); }}
                            className="bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            New essay
                        </Button>
                    </div>
                </motion.div>

                {/* New essay panel */}
                {showNew && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                        <Card className="p-4 sm:p-6 mb-8 bg-white/2.5 border border-blue-500/20">
                            <h2 className="text-lg font-semibold text-white mb-4">Start a new essay</h2>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <FormField label="Level">
                                    <SelectInput
                                        value={level}
                                        onChange={(v: string) => setLevel(v as EssayLevel)}
                                        options={LEVELS.map(l => ({ value: l, label: l }))}
                                    />
                                </FormField>
                                <FormField label="Topic hint (optional)">
                                    <TextInput
                                        value={hint}
                                        onChange={(v: string) => setHint(v)}
                                        placeholder="e.g. environment, urban planning…"
                                    />
                                </FormField>
                                <FormField label="Use weak/due words">
                                    <label className="flex items-center gap-2 h-10 px-3 rounded-md bg-[#0f0f1a] border border-[#2a2b36] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={useWeak}
                                            onChange={(e) => setUseWeak(e.target.checked)}
                                            className="w-4 h-4 accent-blue-400"
                                        />
                                        <span className="text-sm text-white/70">Suggest dictionary words</span>
                                    </label>
                                </FormField>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <Button
                                    onClick={handleGenerate}
                                    disabled={generating}
                                    className="bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25"
                                >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    {generating ? 'Generating…' : 'Generate prompt'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => { setShowNew(false); setGeneratedPrompt(null); setExistingMatch(null); setCustomPrompt(''); }}
                                    className="text-white/60 hover:text-white"
                                >
                                    Cancel
                                </Button>
                            </div>

                            {error && (
                                <div className="mt-4 p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-sm text-rose-300">
                                    {error}
                                </div>
                            )}

                            {existingMatch && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/30"
                                >
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-amber-200">
                                                You already have an essay on a similar topic
                                                <span className="text-white/40"> ({existingMatch.level} · {existingMatch.status})</span>
                                            </p>
                                            <p className="text-sm text-white/80 mt-1 line-clamp-2">
                                                {existingMatch.title || existingMatch.prompt}
                                            </p>
                                            <div className="mt-2 flex gap-2">
                                                <Button
                                                    onClick={() => handleOpenExisting(existingMatch.id)}
                                                    className="h-8 px-3 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40"
                                                >
                                                    Open existing essay
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    onClick={handleGenerate}
                                                    disabled={generating}
                                                    className="h-8 px-3 text-xs text-white/60 hover:text-white"
                                                >
                                                    Try a different topic
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {generatedPrompt && (
                                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-4 rounded-lg bg-white/2.5 border border-amber-500/30">
                                    <p className="text-white/90 whitespace-pre-wrap leading-relaxed">{generatedPrompt.prompt}</p>
                                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/50">
                                        <span className="flex items-center gap-1">
                                            <TargetIcon className="w-3 h-3" />
                                            ~{generatedPrompt.suggested_word_count} words
                                        </span>
                                        {generatedPrompt.target_words.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                <span>Try to use:</span>
                                                {generatedPrompt.target_words.map(w => (
                                                    <span key={w} className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">{w}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-4 flex gap-3">
                                        <Button
                                            onClick={() => handleStartEssay(generatedPrompt.prompt, generatedPrompt.target_words, generatedPrompt.suggested_word_count)}
                                            disabled={creating}
                                            className="bg-amber-500 hover:bg-amber-500/90 text-black"
                                        >
                                            {creating ? 'Starting…' : 'Start writing'}
                                        </Button>
                                        <Button variant="ghost" onClick={() => { setGeneratedPrompt(null); setExistingMatch(null) }} className="text-white/60 hover:text-white">
                                            Generate another
                                        </Button>
                                    </div>
                                </motion.div>
                            )}

                            <div className="mt-6 pt-6 border-t border-white/5">
                                <p className="text-xs uppercase tracking-wider text-white/40 mb-3">Or write your own prompt</p>
                                <TextareaInput
                                    value={customPrompt}
                                    onChange={(v: string) => setCustomPrompt(v)}
                                    placeholder="Describe the essay topic in your own words…"
                                    rows={3}
                                />
                                <Button
                                    onClick={() => customPrompt.trim() && handleStartEssay(customPrompt.trim(), [], 0)}
                                    disabled={!customPrompt.trim() || creating}
                                    className="mt-3 bg-white/5 hover:bg-white/10 text-white border border-white/10"
                                >
                                    Use this prompt
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                )}

                {/* Drafts */}
                {drafts.length > 0 && (
                    <div className="mb-8">
                        <h2 className="text-sm uppercase tracking-wider text-white/40 mb-3">Drafts</h2>
                        <div className="space-y-3">
                            {drafts.map(e => (
                                <EssayRow key={e.id} essay={e} platformId={params.id} onDelete={() => del(e.id)} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Submitted */}
                {submitted.length > 0 && (
                    <div>
                        <h2 className="text-sm uppercase tracking-wider text-white/40 mb-3">Reviewed</h2>
                        <div className="space-y-3">
                            {submitted.map(e => (
                                <EssayRow key={e.id} essay={e} platformId={params.id} onDelete={() => del(e.id)} />
                            ))}
                        </div>
                    </div>
                )}

                {!isLoading && essays.length === 0 && !showNew && (
                    <Card className="p-10 bg-white/2.5 border border-white/5 text-center">
                        <PenLine className="w-10 h-10 text-blue-400/50 mx-auto mb-3" />
                        <p className="text-white/60">No essays yet. Start your first one.</p>
                    </Card>
                )}
            </div>
        </CommandGrid>
    )
}

function EssayRow({ essay, platformId, onDelete }: {
    essay: { id: number; title: string | null; prompt: string; level: string; status: string; word_count: number; target_word_count: number | null; quick_score: number | null; deep_score: number | null; updated_at: string | null; created_at: string }
    platformId: string
    onDelete: () => void
}) {
    const router = useRouter()
    const score = essay.deep_score ?? essay.quick_score
    const dateStr = new Date(essay.updated_at || essay.created_at).toLocaleString()

    return (
        <Card
            onClick={() => router.push(`/platform/${platformId}/learning/writing/${essay.id}`)}
            className="p-4 bg-white/2.5 border border-white/5 hover:border-amber-500/20 hover:bg-white/5 cursor-pointer transition-all group"
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold ${LEVEL_COLOR[essay.level]}`}>{essay.level}</span>
                        <span className="text-xs text-white/30">•</span>
                        <span className="text-xs text-white/50 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {dateStr}
                        </span>
                    </div>
                    <p className="text-white/90 line-clamp-2 mb-1">{essay.title || essay.prompt}</p>
                    <p className="text-xs text-white/50">
                        {essay.word_count} word{essay.word_count === 1 ? '' : 's'}
                        {essay.target_word_count ? ` / ${essay.target_word_count} target` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {score !== null && (
                        <div className="text-right">
                            <p className="text-xl sm:text-2xl font-bold text-blue-400">{score}</p>
                            <p className="text-[10px] uppercase tracking-wider text-white/40">{essay.deep_score !== null ? 'deep' : 'quick'}</p>
                        </div>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete() }}
                        className="p-2 rounded text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </Card>
    )
}
