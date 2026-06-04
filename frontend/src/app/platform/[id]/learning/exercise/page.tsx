'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft, Check, X, RefreshCw, ChevronDown, ChevronUp,
    Volume2, Loader2, Sparkles, AlertCircle, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useFolders, useModules } from '@/lib/hooks/use-dictionary'
import {
    useExerciseWords,
    useStartExerciseSession,
    useGradeExercises,
    type ExerciseWord,
    type ExerciseGradeResult,
} from '@/lib/hooks/use-exercises'

// ─── helpers ────────────────────────────────────────────────────────────────

function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'; u.rate = 0.9
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
}

function scoreColor(s: number | null) {
    if (s === null) return 'text-white/40'
    if (s >= 8) return 'text-emerald-300'
    if (s >= 5) return 'text-amber-300'
    return 'text-rose-300'
}

const DIFF_CHIP: Record<string, string> = {
    A1: 'bg-green-500/15 text-green-300 border-green-500/30',
    A2: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    B1: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    B2: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    C1: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    C2: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

// ─── Word card ───────────────────────────────────────────────────────────────

function WordCard({
    index, word, value, onChange, result, disabled,
}: {
    index: number
    word: ExerciseWord
    value: string
    onChange: (v: string) => void
    result?: ExerciseGradeResult
    disabled: boolean
}) {
    const [showExample, setShowExample] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }, [value])

    const hasWord = value.toLowerCase().includes(word.word.toLowerCase())
    const borderClass = result
        ? result.is_correct
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-rose-500/50 bg-rose-500/5'
        : 'border-white/10 focus-within:border-white/25'

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
        >
            <Card className={`p-4 sm:p-5 border transition-colors ${borderClass}`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-white/30 text-xs tabular-nums">#{index + 1}</span>
                        <span className="text-xl font-bold text-white">{word.word}</span>
                        {word.part_of_speech && (
                            <span className="text-white/40 text-xs uppercase tracking-wide">{word.part_of_speech}</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${DIFF_CHIP[word.difficulty] ?? 'bg-white/10 text-white/50 border-white/20'}`}>
                            {word.difficulty}
                        </span>
                        {word.phonetic && (
                            <span className="text-white/35 text-xs">{word.phonetic}</span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => speak(word.word)}
                        className="shrink-0 p-1.5 rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-colors"
                        aria-label="Pronounce"
                    >
                        <Volume2 className="w-4 h-4" />
                    </button>
                </div>

                {/* Definition */}
                <p className="text-white/65 text-sm leading-relaxed mb-3">{word.definition}</p>
                {word.translation && (
                    <p className="text-blue-300/55 text-xs mb-3">{word.translation}</p>
                )}

                {/* Show example toggle */}
                {word.examples.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setShowExample(p => !p)}
                        className="flex items-center gap-1 text-xs text-white/35 hover:text-white/60 transition-colors mb-3"
                    >
                        {showExample ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {showExample ? 'Hide example' : 'Show example'}
                    </button>
                )}
                <AnimatePresence>
                    {showExample && word.examples[0] && (
                        <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-white/40 text-xs italic mb-3 pl-3 border-l border-white/15"
                        >
                            &ldquo;{word.examples[0]}&rdquo;
                        </motion.p>
                    )}
                </AnimatePresence>

                {/* Input */}
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    disabled={disabled}
                    placeholder={`Write a sentence using "${word.word}"…`}
                    rows={2}
                    className={`w-full resize-none px-3 py-2.5 rounded-xl border text-white text-sm bg-white/5 focus:outline-none transition-colors overflow-hidden ${
                        disabled ? 'opacity-70 cursor-not-allowed' : 'border-white/15 focus:border-white/35'
                    }`}
                />

                {/* Live word-used indicator */}
                {!disabled && value.trim() && (
                    <p className={`text-xs mt-1.5 transition-colors ${hasWord ? 'text-emerald-400' : 'text-white/30'}`}>
                        {hasWord ? '✓ word used' : 'word not yet used'}
                    </p>
                )}

                {/* Grade result */}
                <AnimatePresence>
                    {result && (
                        <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-3 space-y-2"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {result.is_correct
                                        ? <Check className="w-4 h-4 text-emerald-400" />
                                        : <X className="w-4 h-4 text-rose-400" />}
                                    <span className={`text-sm font-medium ${result.is_correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                                        {result.is_correct ? 'Correct' : 'Needs work'}
                                    </span>
                                </div>
                                {result.usage_score !== null && (
                                    <span className={`text-sm font-bold tabular-nums ${scoreColor(result.usage_score)}`}>
                                        {result.usage_score}/10
                                    </span>
                                )}
                            </div>
                            {result.feedback && (
                                <p className="text-xs text-white/60 leading-relaxed">{result.feedback}</p>
                            )}
                            {result.suggested_revision && (
                                <div className="rounded-lg border border-blue-500/25 bg-blue-500/8 px-3 py-2">
                                    <p className="text-[10px] uppercase tracking-wide text-blue-400/70 mb-1">Suggested</p>
                                    <p className="text-xs text-blue-200/80 italic">&ldquo;{result.suggested_revision}&rdquo;</p>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </Card>
        </motion.div>
    )
}

// ─── Scope / count picker ────────────────────────────────────────────────────

function SetupPanel({
    count, setCount,
    dueOnly, setDueOnly,
    folderId, setFolderId,
    moduleId, setModuleId,
    onStart, isLoading,
}: {
    count: number
    setCount: (n: number) => void
    dueOnly: boolean
    setDueOnly: (v: boolean) => void
    folderId: number | undefined
    setFolderId: (v: number | undefined) => void
    moduleId: number | undefined
    setModuleId: (v: number | undefined) => void
    onStart: () => void
    isLoading: boolean
}) {
    const { data: folders = [] } = useFolders()
    const { data: modules = [] } = useModules(folderId)

    return (
        <div className="space-y-4">
            <Card className="p-4 bg-white/2.5 border border-white/5">
                <p className="text-sm text-white/60 mb-3">Number of words</p>
                <div className="flex gap-2 flex-wrap">
                    {[3, 5, 8, 10].map(n => (
                        <button
                            key={n}
                            onClick={() => setCount(n)}
                            className={`px-4 py-1.5 rounded-lg text-sm border transition-all ${
                                count === n
                                    ? 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                                    : 'border-white/10 text-white/50 hover:bg-white/5'
                            }`}
                        >
                            {n}
                        </button>
                    ))}
                </div>
            </Card>

            <Card className="p-4 bg-white/2.5 border border-white/5">
                <p className="text-sm text-white/60 mb-3">Practice from</p>
                <div className="flex gap-2 flex-wrap mb-3">
                    <button
                        onClick={() => { setFolderId(undefined); setModuleId(undefined) }}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                            !folderId ? 'border-rose-500/50 bg-rose-500/10 text-rose-300' : 'border-white/10 text-white/50 hover:bg-white/5'
                        }`}
                    >All words</button>
                    {folders.map(f => (
                        <button key={f.id}
                            onClick={() => { setFolderId(f.id); setModuleId(undefined) }}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                folderId === f.id ? 'border-rose-500/50 bg-rose-500/10 text-rose-300' : 'border-white/10 text-white/50 hover:bg-white/5'
                            }`}
                        >
                            <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: f.color ?? '#6b7280' }} />
                            {f.name}
                        </button>
                    ))}
                </div>
                {folderId && modules.length > 0 && (
                    <div className="flex gap-2 flex-wrap pt-3 border-t border-white/5">
                        <span className="text-xs text-white/30 self-center mr-1">Module:</span>
                        {modules.map(m => (
                            <button key={m.id}
                                onClick={() => setModuleId(moduleId === m.id ? undefined : m.id)}
                                className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                                    moduleId === m.id ? 'border-rose-500/50 bg-rose-500/10 text-rose-300' : 'border-white/10 text-white/40 hover:bg-white/5'
                                }`}
                            >{m.name}</button>
                        ))}
                    </div>
                )}
            </Card>

            <Card className="p-4 bg-white/2.5 border border-white/5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-white/70">Due for review only</p>
                        <p className="text-xs text-white/35 mt-0.5">Words whose review interval has elapsed</p>
                    </div>
                    <button
                        onClick={() => setDueOnly(!dueOnly)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${dueOnly ? 'bg-rose-500' : 'bg-white/10'}`}
                    >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${dueOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                </div>
            </Card>

            <Button
                onClick={onStart}
                disabled={isLoading}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3 text-base gap-2"
            >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isLoading ? 'Loading words…' : 'Start Exercise'}
            </Button>
        </div>
    )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
    total, correct, accuracy,
    onRetry, onBack,
}: {
    total: number; correct: number; accuracy: number
    onRetry: () => void; onBack: () => void
}) {
    const emoji = accuracy >= 80 ? '🎉' : accuracy >= 50 ? '👍' : '📚'
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-6"
        >
            <div className="text-5xl">{emoji}</div>
            <div>
                <p className="text-4xl font-bold text-white">{accuracy}%</p>
                <p className="text-white/50 mt-1">{correct} / {total} correct</p>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
                <Button onClick={onRetry} variant="outline" className="border-white/20 text-white hover:bg-white/5 gap-2">
                    <RefreshCw className="w-4 h-4" /> Try again
                </Button>
                <Button onClick={onBack} className="bg-rose-600 hover:bg-rose-700 text-white">
                    Done
                </Button>
            </div>
        </motion.div>
    )
}

// ─── Page ────────────────────────────────────────────────────────────────────

type Phase = 'setup' | 'writing' | 'results'

export default function ExercisePage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [phase, setPhase] = useState<Phase>('setup')
    const [count, setCount] = useState(5)
    const [dueOnly, setDueOnly] = useState(false)
    const [folderId, setFolderId] = useState<number | undefined>()
    const [moduleId, setModuleId] = useState<number | undefined>()
    const [words, setWords] = useState<ExerciseWord[]>([])
    const [sentences, setSentences] = useState<Record<number, string>>({})
    const [sessionId, setSessionId] = useState<number | undefined>()
    const [gradeResults, setGradeResults] = useState<ExerciseGradeResult[]>([])
    const [summary, setSummary] = useState<{ total: number; correct: number; accuracy: number } | null>(null)
    const [error, setError] = useState<string | null>(null)

    const { refetch: fetchWords, isFetching: loadingWords } = useExerciseWords({
        count,
        folderId: moduleId ? undefined : folderId,
        moduleId,
        dueOnly,
    })
    const { mutate: startSession } = useStartExerciseSession()
    const { mutate: grade, isPending: grading } = useGradeExercises()

    const resultByWordId = Object.fromEntries(gradeResults.map(r => [r.word_id, r]))

    const start = async () => {
        setError(null)
        const res = await fetchWords()
        if (res.error || !res.data?.length) {
            setError('Could not load words. Add words to your dictionary first.')
            return
        }
        setWords(res.data)
        setSentences(Object.fromEntries(res.data.map(w => [w.id, ''])))
        setGradeResults([])
        setSummary(null)
        startSession(undefined, {
            onSuccess: s => setSessionId(s.id),
            onError: () => setSessionId(undefined),
        })
        setPhase('writing')
    }

    const submit = () => {
        const items = words.map(w => ({ word_id: w.id, sentence: sentences[w.id] ?? '' }))
        const empty = items.filter(i => !i.sentence.trim())
        if (empty.length > 0) {
            setError(`Fill in ${empty.length} sentence${empty.length > 1 ? 's' : ''} before submitting.`)
            return
        }
        setError(null)
        grade(
            { sessionId, items },
            {
                onSuccess: resp => {
                    setGradeResults(resp.results)
                    setSummary({ total: resp.total, correct: resp.correct, accuracy: resp.accuracy })
                    setPhase('results')
                },
                onError: (e) => setError(e.message || 'An error occurred while grading.'),
            },
        )
    }

    const retry = () => {
        setSentences(Object.fromEntries(words.map(w => [w.id, ''])))
        setGradeResults([])
        setSummary(null)
        setPhase('writing')
    }

    const back = () => router.push(`/platform/${params.id}/learning`)

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 mb-6 sm:mb-10"
                >
                    <button
                        onClick={() => phase === 'setup' ? back() : setPhase('setup')}
                        className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-all shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-xl sm:text-2xl font-bold text-white">
                        {phase === 'setup' ? 'Exercise' : phase === 'writing' ? 'Write a sentence for each word' : 'Results'}
                    </h1>
                    {phase === 'writing' && (
                        <span className="ml-auto text-xs text-white/40 shrink-0">
                            {words.length} word{words.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </motion.div>

                <AnimatePresence mode="wait">
                    {/* Setup */}
                    {phase === 'setup' && (
                        <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div className="mb-5">
                                <p className="text-white/55 text-sm leading-relaxed">
                                    Practice using your dictionary words in real sentences. An AI coach grades each sentence for accuracy and natural usage.
                                </p>
                            </div>
                            {error && (
                                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <p className="text-amber-300 text-sm">{error}</p>
                                </div>
                            )}
                            <SetupPanel
                                count={count} setCount={setCount}
                                dueOnly={dueOnly} setDueOnly={setDueOnly}
                                folderId={folderId} setFolderId={setFolderId}
                                moduleId={moduleId} setModuleId={setModuleId}
                                onStart={start} isLoading={loadingWords}
                            />
                        </motion.div>
                    )}

                    {/* Writing */}
                    {phase === 'writing' && (
                        <motion.div key="writing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                            <p className="text-white/45 text-xs">
                                Use each target word in a complete, natural sentence. One per box.
                            </p>
                            {words.map((w, i) => (
                                <WordCard
                                    key={w.id}
                                    index={i}
                                    word={w}
                                    value={sentences[w.id] ?? ''}
                                    onChange={v => setSentences(prev => ({ ...prev, [w.id]: v }))}
                                    result={resultByWordId[w.id]}
                                    disabled={grading || phase !== 'writing'}
                                />
                            ))}
                            {error && (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <p className="text-amber-300 text-sm">{error}</p>
                                </div>
                            )}
                            <div className="flex items-center justify-between gap-3 pt-2">
                                <p className="text-xs text-white/30 flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" />
                                    AI-graded · takes ~5–10s
                                </p>
                                <Button
                                    onClick={submit}
                                    disabled={grading}
                                    className="bg-rose-600 hover:bg-rose-700 text-white gap-2"
                                >
                                    {grading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    {grading ? 'Grading…' : 'Submit for grading'}
                                </Button>
                            </div>
                        </motion.div>
                    )}

                    {/* Results */}
                    {phase === 'results' && summary && (
                        <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                            <SummaryCard {...summary} onRetry={retry} onBack={back} />
                            <div className="pt-4 space-y-4">
                                {words.map((w, i) => (
                                    <WordCard
                                        key={w.id}
                                        index={i}
                                        word={w}
                                        value={sentences[w.id] ?? ''}
                                        onChange={() => {}}
                                        result={resultByWordId[w.id]}
                                        disabled
                                    />
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
