'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    Check,
    Loader2,
    PenLine,
    RefreshCw,
    Sparkles,
    Volume2,
    X,
    Zap,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useFolders, useModules } from '@/lib/hooks/use-dictionary'
import {
    useExerciseWords,
    useGradeExercises,
    useStartExerciseSession,
    type ExerciseGradeResult,
    type ExerciseWord,
} from '@/lib/hooks/use-exercises'

type Phase = 'setup' | 'write' | 'grading' | 'results'
type Source = 'smart' | 'due' | 'weak' | 'all'

const COUNT_OPTIONS = [3, 5, 8, 10] as const

const DIFF_COLOR: Record<string, string> = {
    A1: 'text-green-400',
    A2: 'text-emerald-400',
    B1: 'text-blue-400',
    B2: 'text-indigo-400',
    C1: 'text-purple-400',
    C2: 'text-rose-400',
}

function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.95
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
}

function containsTargetWord(sentence: string, target: string): boolean {
    if (!sentence || !target) return false
    const stem = target.toLowerCase().replace(/[^a-z']/g, '')
    if (!stem) return false
    const escaped = stem.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    // Allow standard English suffixes so "run" also matches "running" or "ran-ish" usage.
    return new RegExp(`\\b${escaped}(s|es|ed|d|ing|er|est|ly|ies|ied)?\\b`, 'i').test(sentence)
}

export default function ExercisesPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    // ── Setup state ──────────────────────────────────────────────────────────
    const [phase, setPhase] = useState<Phase>('setup')
    const [source, setSource] = useState<Source>('smart')
    const [count, setCount] = useState<number>(5)
    const [folderId, setFolderId] = useState<number | undefined>(undefined)
    const [moduleId, setModuleId] = useState<number | undefined>(undefined)
    const [error, setError] = useState<string | null>(null)

    // ── Session state ────────────────────────────────────────────────────────
    const [sessionId, setSessionId] = useState<number | undefined>(undefined)
    const [words, setWords] = useState<ExerciseWord[]>([])
    const [sentences, setSentences] = useState<Record<number, string>>({})
    const [results, setResults] = useState<ExerciseGradeResult[]>([])

    const { data: folders = [] } = useFolders()
    const { data: modules = [] } = useModules(folderId)

    const wordsQuery = useExerciseWords({
        count,
        moduleId,
        folderId,
        dueOnly: source === 'due',
        weakOnly: source === 'weak',
    })
    const startSession = useStartExerciseSession()
    const gradeExercises = useGradeExercises()

    // Reset module when folder changes.
    useEffect(() => {
        setModuleId(undefined)
    }, [folderId])

    const startRun = useCallback(async () => {
        setError(null)
        try {
            const fetched = await wordsQuery.refetch()
            const list = fetched.data ?? []
            if (list.length === 0) {
                setError('No words match these filters. Add words or relax filters.')
                return
            }
            const session = await startSession.mutateAsync()
            setSessionId(session.id)
            setWords(list)
            setSentences(Object.fromEntries(list.map((w) => [w.id, ''])))
            setResults([])
            setPhase('write')
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to start exercises.')
        }
    }, [wordsQuery, startSession])

    const submitAll = useCallback(async () => {
        setError(null)
        // Local validation — empty sentences are useless to send.
        const items = words
            .map((w) => ({ word_id: w.id, sentence: (sentences[w.id] ?? '').trim() }))
            .filter((it) => it.sentence.length > 0)

        if (items.length === 0) {
            setError('Write at least one sentence before submitting.')
            return
        }

        setPhase('grading')
        try {
            const res = await gradeExercises.mutateAsync({ sessionId, items })
            setResults(res.results)
            setPhase('results')
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Grader failed. Please try again.')
            setPhase('write')
        }
    }, [words, sentences, sessionId, gradeExercises])

    const resetAll = useCallback(() => {
        setPhase('setup')
        setSessionId(undefined)
        setWords([])
        setSentences({})
        setResults([])
        setError(null)
    }, [])

    const filledCount = useMemo(
        () => Object.values(sentences).filter((s) => s.trim().length > 0).length,
        [sentences],
    )
    const correctCount = results.filter((r) => r.is_correct).length
    const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-3xl mx-auto">
                {/* Top bar */}
                <div className="flex items-center justify-between mb-6">
                    <button
                        onClick={() => (phase === 'setup'
                            ? router.push(`/platform/${params.id}/learning`)
                            : resetAll())}
                        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="text-sm">
                            {phase === 'setup' ? 'Learning' : 'Back to setup'}
                        </span>
                    </button>

                    {phase === 'write' && (
                        <span className="text-xs text-white/40">
                            {filledCount}/{words.length} filled
                        </span>
                    )}
                </div>

                <AnimatePresence mode="wait">
                    {phase === 'setup' && (
                        <SetupView
                            key="setup"
                            source={source}
                            setSource={setSource}
                            count={count}
                            setCount={setCount}
                            folders={folders as { id: number; name: string }[]}
                            folderId={folderId}
                            setFolderId={setFolderId}
                            modules={modules as { id: number; name: string }[]}
                            moduleId={moduleId}
                            setModuleId={setModuleId}
                            startRun={startRun}
                            error={error}
                            isLoading={wordsQuery.isFetching || startSession.isPending}
                        />
                    )}

                    {phase === 'write' && (
                        <WriteView
                            key="write"
                            words={words}
                            sentences={sentences}
                            setSentences={setSentences}
                            submitAll={submitAll}
                            isSubmitting={gradeExercises.isPending}
                            error={error}
                        />
                    )}

                    {phase === 'grading' && (
                        <GradingView key="grading" />
                    )}

                    {phase === 'results' && (
                        <ResultsView
                            key="results"
                            results={results}
                            words={words}
                            sentences={sentences}
                            correctCount={correctCount}
                            accuracy={accuracy}
                            onAgain={() => {
                                setSentences(Object.fromEntries(words.map((w) => [w.id, ''])))
                                setResults([])
                                setPhase('write')
                            }}
                            onDone={resetAll}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}

// ─── Setup view ─────────────────────────────────────────────────────────────

function SetupView({
    source,
    setSource,
    count,
    setCount,
    folders,
    folderId,
    setFolderId,
    modules,
    moduleId,
    setModuleId,
    startRun,
    error,
    isLoading,
}: {
    source: Source
    setSource: (v: Source) => void
    count: number
    setCount: (v: number) => void
    folders: { id: number; name: string }[]
    folderId: number | undefined
    setFolderId: (v: number | undefined) => void
    modules: { id: number; name: string }[]
    moduleId: number | undefined
    setModuleId: (v: number | undefined) => void
    startRun: () => void
    error: string | null
    isLoading: boolean
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
        >
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 rounded-lg bg-amber-500/10">
                        <PenLine className="w-5 h-5 text-amber-400" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Exercises</h1>
                </div>
                <p className="text-sm text-white/50">
                    Write a sentence using each target word. AI grades meaning, grammar, and naturalness — correct usage strengthens the word's SRS interval.
                </p>
            </div>

            <Card className="p-5 sm:p-6 bg-white/2.5 border border-white/5 space-y-6">
                {/* Source */}
                <section>
                    <h2 className="text-xs uppercase tracking-wide text-white/40 mb-3">Word source</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                            { id: 'smart' as const, label: 'Smart mix', hint: 'Default' },
                            { id: 'due' as const, label: 'Due review', hint: 'SRS due' },
                            { id: 'weak' as const, label: 'Weak words', hint: '<70% acc' },
                            { id: 'all' as const, label: 'All words', hint: 'Random' },
                        ].map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() => setSource(opt.id)}
                                className={`px-3 py-3 rounded-lg border text-left transition-colors ${
                                    source === opt.id
                                        ? 'border-amber-500/50 bg-amber-500/10 text-white'
                                        : 'border-white/10 hover:border-white/20 bg-white/2.5 text-white/70'
                                }`}
                            >
                                <div className="text-sm font-medium">{opt.label}</div>
                                <div className="text-[11px] text-white/40 mt-0.5">{opt.hint}</div>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Folder / Module */}
                <section>
                    <h2 className="text-xs uppercase tracking-wide text-white/40 mb-3">Scope</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select
                            value={folderId ?? ''}
                            onChange={(e) =>
                                setFolderId(e.target.value ? Number(e.target.value) : undefined)
                            }
                            className="bg-[#13141f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-colors"
                        >
                            <option value="">All folders</option>
                            {folders.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={moduleId ?? ''}
                            onChange={(e) =>
                                setModuleId(e.target.value ? Number(e.target.value) : undefined)
                            }
                            disabled={!folderId}
                            className="bg-[#13141f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 disabled:opacity-50 transition-colors"
                        >
                            <option value="">{folderId ? 'All modules in folder' : 'Pick a folder first'}</option>
                            {modules.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </section>

                {/* Count */}
                <section>
                    <h2 className="text-xs uppercase tracking-wide text-white/40 mb-3">How many words</h2>
                    <div className="flex gap-2">
                        {COUNT_OPTIONS.map((n) => (
                            <button
                                key={n}
                                onClick={() => setCount(n)}
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                    count === n
                                        ? 'border-amber-500/50 bg-amber-500/10 text-white'
                                        : 'border-white/10 hover:border-white/20 bg-white/2.5 text-white/70'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </section>

                {error && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
                        <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <span className="text-sm text-red-200">{error}</span>
                    </div>
                )}

                <Button
                    onClick={startRun}
                    disabled={isLoading}
                    className="w-full h-11 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-medium"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Loading words…
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Start exercises
                        </>
                    )}
                </Button>
            </Card>
        </motion.div>
    )
}

// ─── Write view ─────────────────────────────────────────────────────────────

function WriteView({
    words,
    sentences,
    setSentences,
    submitAll,
    isSubmitting,
    error,
}: {
    words: ExerciseWord[]
    sentences: Record<number, string>
    setSentences: (
        updater: (prev: Record<number, string>) => Record<number, string>,
    ) => void
    submitAll: () => void
    isSubmitting: boolean
    error: string | null
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 pb-32"
        >
            <div className="mb-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                    Write a sentence for each word
                </h1>
                <p className="text-sm text-white/50 mt-1">
                    Use each target word in a complete, natural sentence. One per box.
                </p>
            </div>

            {words.map((w, i) => (
                <WordEntryCard
                    key={w.id}
                    index={i}
                    word={w}
                    value={sentences[w.id] ?? ''}
                    onChange={(v) => setSentences((prev) => ({ ...prev, [w.id]: v }))}
                />
            ))}

            {/* Sticky submit bar */}
            <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[640px] z-30">
                <div className="rounded-2xl border border-white/10 bg-[#0f1019]/95 backdrop-blur-md p-3 shadow-xl shadow-black/60">
                    {error && (
                        <p className="text-xs text-red-300 mb-2 px-1">{error}</p>
                    )}
                    <Button
                        onClick={submitAll}
                        disabled={isSubmitting}
                        className="w-full h-11 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-medium"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Grading…
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4 mr-2" />
                                Submit for grading
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </motion.div>
    )
}

function WordEntryCard({
    index,
    word,
    value,
    onChange,
}: {
    index: number
    word: ExerciseWord
    value: string
    onChange: (v: string) => void
}) {
    const used = containsTargetWord(value, word.word)
    const tooShort = value.trim().split(/\s+/).filter(Boolean).length < 3
    const ready = value.trim().length > 0 && used && !tooShort

    return (
        <Card className="p-4 sm:p-5 bg-white/2.5 border border-white/5">
            <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-white/30">#{index + 1}</span>
                        <h3 className="text-lg font-semibold text-white">{word.word}</h3>
                        {word.part_of_speech && (
                            <span className="text-[11px] uppercase tracking-wide text-white/40">
                                {word.part_of_speech}
                            </span>
                        )}
                        {word.difficulty && (
                            <span className={`text-[11px] font-medium ${DIFF_COLOR[word.difficulty] ?? 'text-white/40'}`}>
                                {word.difficulty}
                            </span>
                        )}
                        {word.phonetic && (
                            <span className="text-xs text-white/40">/{word.phonetic}/</span>
                        )}
                    </div>
                    <p className="text-sm text-white/70 mt-1.5 leading-relaxed">{word.definition}</p>
                </div>
                <button
                    type="button"
                    onClick={() => speak(word.word)}
                    title="Pronounce"
                    className="p-2 rounded-lg text-white/50 hover:text-amber-300 hover:bg-white/5 transition-colors shrink-0"
                >
                    <Volume2 className="w-4 h-4" />
                </button>
            </div>

            {word.examples?.length > 0 && (
                <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-white/30 hover:text-white/60 transition-colors">
                        Show example
                    </summary>
                    <ul className="mt-2 space-y-1">
                        {word.examples.slice(0, 2).map((ex, j) => (
                            <li key={j} className="text-xs text-white/50 italic">
                                “{ex}”
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={`Write a sentence using "${word.word}"…`}
                rows={2}
                maxLength={400}
                className="mt-3 w-full bg-[#13141f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-amber-500 transition-colors resize-y min-h-[64px]"
            />

            <div className="flex items-center justify-between mt-1.5 px-1 text-[11px]">
                <div className="flex items-center gap-3">
                    <span className={used ? 'text-emerald-300' : 'text-white/30'}>
                        {used ? '✓ word used' : 'word not yet used'}
                    </span>
                    {value.trim().length > 0 && tooShort && (
                        <span className="text-amber-300/80">aim for a full sentence</span>
                    )}
                </div>
                <span className={`text-[11px] ${ready ? 'text-emerald-300' : 'text-white/30'}`}>
                    {value.length}/400
                </span>
            </div>
        </Card>
    )
}

// ─── Grading view (loader) ──────────────────────────────────────────────────

function GradingView() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-24"
        >
            <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin" />
                <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-amber-300" />
            </div>
            <p className="mt-6 text-sm text-white/60">AI is grading your sentences…</p>
            <p className="mt-1 text-xs text-white/30">Usually 3–6 seconds</p>
        </motion.div>
    )
}

// ─── Results view ───────────────────────────────────────────────────────────

function ResultsView({
    results,
    words,
    sentences,
    correctCount,
    accuracy,
    onAgain,
    onDone,
}: {
    results: ExerciseGradeResult[]
    words: ExerciseWord[]
    sentences: Record<number, string>
    correctCount: number
    accuracy: number
    onAgain: () => void
    onDone: () => void
}) {
    // Map back to the original word order so the result list reads in the same
    // sequence the learner answered in.
    const ordered = useMemo(() => {
        const byId = new Map(results.map((r) => [r.word_id, r] as const))
        return words
            .filter((w) => (sentences[w.id] ?? '').trim().length > 0)
            .map((w) => byId.get(w.id))
            .filter((r): r is ExerciseGradeResult => Boolean(r))
    }, [results, words, sentences])

    const headline = accuracy >= 80
        ? 'Strong run.'
        : accuracy >= 50
        ? 'Solid — sharpen the misses.'
        : 'Plenty to learn from.'

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 pb-24"
        >
            {/* Score banner */}
            <Card className="p-5 sm:p-6 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/30">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-amber-300/80">
                            Exercise results
                        </p>
                        <p className="text-2xl sm:text-3xl font-bold text-white mt-1">
                            {correctCount}/{ordered.length}
                            <span className="text-lg text-white/50 ml-2">· {accuracy}%</span>
                        </p>
                        <p className="text-sm text-white/60 mt-1">{headline}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={onAgain}
                            variant="outline"
                            className="border-white/20 text-white hover:bg-white/5"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Rewrite these
                        </Button>
                        <Button
                            onClick={onDone}
                            className="bg-amber-600 hover:bg-amber-500 text-white"
                        >
                            New set
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </Card>

            {ordered.map((r) => (
                <ResultCard key={r.word_id} result={r} />
            ))}
        </motion.div>
    )
}

function ResultCard({ result }: { result: ExerciseGradeResult }) {
    const tone = result.is_correct
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-red-500/30 bg-red-500/5'
    const Icon = result.is_correct ? Check : X
    const iconColor = result.is_correct ? 'text-emerald-300' : 'text-red-300'

    return (
        <Card className={`p-4 sm:p-5 border ${tone}`}>
            <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${iconColor}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-white">{result.word}</h3>
                        {result.usage_score !== null && (
                            <span className="text-[11px] text-white/40">
                                usage {result.usage_score}/100
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-white/80 mt-2 italic leading-relaxed">
                        “{result.sentence}”
                    </p>
                    {result.feedback && (
                        <p className="text-sm text-white/70 mt-3 leading-relaxed">
                            {result.feedback}
                        </p>
                    )}
                    {result.suggested_revision && (
                        <div className="mt-3 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                            <p className="text-[11px] uppercase tracking-wide text-amber-300/80 mb-1">
                                Suggested revision
                            </p>
                            <p className="text-sm text-white/85 leading-relaxed">
                                {result.suggested_revision}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}
