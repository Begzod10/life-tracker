'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Brain, BookOpen, Keyboard, RefreshCw, Check, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usePracticeWords, useSubmitResult, useCreateSession, useCompleteSession, type PracticeWord } from '@/lib/hooks/use-practice'

type Mode = 'flashcard' | 'quiz' | 'spelling'
type Phase = 'pick' | 'session' | 'results'

// ── Flashcard ───────────────────────────────────────────────────────────────

function Flashcard({ word, onCorrect, onSkip }: {
    word: PracticeWord
    onCorrect: () => void
    onSkip: () => void
}) {
    const [flipped, setFlipped] = useState(false)

    return (
        <div className="flex flex-col items-center gap-6">
            <div
                className="w-full max-w-md h-64 cursor-pointer perspective-1000"
                onClick={() => setFlipped(p => !p)}
            >
                <motion.div
                    className="relative w-full h-full"
                    animate={{ rotateY: flipped ? 180 : 0 }}
                    transition={{ duration: 0.45, ease: 'easeInOut' }}
                    style={{ transformStyle: 'preserve-3d' }}
                >
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center p-6">
                        <p className="text-3xl font-bold text-white text-center">{word.word}</p>
                        {word.phonetic && <p className="text-white/40 mt-2 text-sm">{word.phonetic}</p>}
                        <p className="text-white/30 text-xs mt-6">tap to reveal</p>
                    </div>
                    {/* Back */}
                    <div
                        className="absolute inset-0 backface-hidden bg-blue-500/5 border border-blue-500/20 rounded-2xl flex flex-col items-center justify-center p-6 overflow-auto"
                        style={{ transform: 'rotateY(180deg)' }}
                    >
                        <p className="text-white/80 text-center text-sm leading-relaxed">{word.definition}</p>
                        {word.translation && (
                            <p className="text-blue-300/70 text-sm mt-3 text-center">{word.translation}</p>
                        )}
                        {word.examples && word.examples[0] && (
                            <p className="text-white/40 text-xs mt-4 italic text-center">&ldquo;{word.examples[0]}&rdquo;</p>
                        )}
                    </div>
                </motion.div>
            </div>

            {flipped && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                    <Button onClick={onSkip} variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2">
                        <X className="w-4 h-4" /> Didn't know
                    </Button>
                    <Button onClick={onCorrect} className="bg-green-600 hover:bg-green-700 text-white gap-2">
                        <Check className="w-4 h-4" /> Got it
                    </Button>
                </motion.div>
            )}
        </div>
    )
}

// ── Quiz ────────────────────────────────────────────────────────────────────

function Quiz({ word, onAnswer }: {
    word: PracticeWord
    onAnswer: (correct: boolean) => void
}) {
    const [selected, setSelected] = useState<string | null>(null)

    const pick = (option: string) => {
        if (selected) return
        setSelected(option)
        const correct = option === word.word
        setTimeout(() => onAnswer(correct), 800)
    }

    return (
        <div className="w-full max-w-md space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
                <p className="text-white/50 text-xs mb-3">Which word matches this definition?</p>
                <p className="text-white text-base leading-relaxed">{word.definition}</p>
                {word.translation && <p className="text-blue-300/60 text-sm mt-2">{word.translation}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
                {word.options.map(opt => {
                    let cls = 'border-white/10 text-white hover:bg-white/10'
                    if (selected) {
                        if (opt === word.word) cls = 'border-green-500/50 bg-green-500/10 text-green-400'
                        else if (opt === selected) cls = 'border-red-500/50 bg-red-500/10 text-red-400'
                        else cls = 'border-white/5 text-white/30'
                    }
                    return (
                        <button
                            key={opt}
                            onClick={() => pick(opt)}
                            className={`p-3 rounded-xl border text-sm font-medium transition-all ${cls}`}
                        >
                            {opt}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// ── Spelling ─────────────────────────────────────────────────────────────────

function Spelling({ word, onAnswer }: {
    word: PracticeWord
    onAnswer: (correct: boolean) => void
}) {
    const [input, setInput] = useState('')
    const [submitted, setSubmitted] = useState(false)

    const submit = () => {
        if (!input.trim() || submitted) return
        setSubmitted(true)
        const correct = input.trim().toLowerCase() === word.word.toLowerCase()
        setTimeout(() => onAnswer(correct), 900)
    }

    return (
        <div className="w-full max-w-md space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
                <p className="text-white/50 text-xs mb-3">Type the word for this definition</p>
                <p className="text-white text-base leading-relaxed">{word.definition}</p>
                {word.translation && <p className="text-blue-300/60 text-sm mt-2">{word.translation}</p>}
                {word.examples && word.examples[0] && (
                    <p className="text-white/30 text-xs mt-3 italic">&ldquo;{word.examples[0]}&rdquo;</p>
                )}
            </div>

            <div className="space-y-3">
                <input
                    autoFocus
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    disabled={submitted}
                    placeholder="Type the word…"
                    className={`w-full px-4 py-3 rounded-xl border text-white text-center text-lg font-medium bg-white/5 focus:outline-none transition-colors ${
                        submitted
                            ? input.trim().toLowerCase() === word.word.toLowerCase()
                                ? 'border-green-500/50 bg-green-500/5'
                                : 'border-red-500/50 bg-red-500/5'
                            : 'border-white/10 focus:border-white/25'
                    }`}
                />
                {submitted && input.trim().toLowerCase() !== word.word.toLowerCase() && (
                    <p className="text-center text-sm text-white/50">Correct: <span className="text-green-400 font-medium">{word.word}</span></p>
                )}
                {!submitted && (
                    <Button onClick={submit} className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={!input.trim()}>
                        Check
                    </Button>
                )}
            </div>
        </div>
    )
}

// ── Session ──────────────────────────────────────────────────────────────────

function Session({ words, mode, onDone }: {
    words: PracticeWord[]
    mode: Mode
    onDone: (correct: number, total: number) => void
}) {
    const [index, setIndex] = useState(0)
    const [correct, setCorrect] = useState(0)
    const { mutate: submitResult } = useSubmitResult()

    const word = words[index]
    const progress = ((index) / words.length) * 100

    const advance = useCallback((wasCorrect: boolean) => {
        submitResult({ wordId: word.id, wasCorrect })
        if (wasCorrect) setCorrect(p => p + 1)
        if (index + 1 >= words.length) {
            onDone(wasCorrect ? correct + 1 : correct, words.length)
        } else {
            setIndex(p => p + 1)
        }
    }, [word, index, correct, words.length, onDone, submitResult])

    return (
        <div className="flex flex-col items-center gap-8">
            {/* Progress */}
            <div className="w-full max-w-md">
                <div className="flex justify-between text-xs text-white/40 mb-1.5">
                    <span>{index + 1} / {words.length}</span>
                    <span>{correct} correct</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-blue-500 rounded-full"
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={word.id}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.2 }}
                    className="w-full flex flex-col items-center"
                >
                    {mode === 'flashcard' && (
                        <Flashcard word={word} onCorrect={() => advance(true)} onSkip={() => advance(false)} />
                    )}
                    {mode === 'quiz' && (
                        <Quiz word={word} onAnswer={advance} />
                    )}
                    {mode === 'spelling' && (
                        <Spelling word={word} onAnswer={advance} />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

// ── Results ───────────────────────────────────────────────────────────────────

function Results({ correct, total, mode, onRetry, onBack }: {
    correct: number
    total: number
    mode: Mode
    onRetry: () => void
    onBack: () => void
}) {
    const pct = Math.round(correct / total * 100)
    const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚'

    return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6">
            <div className="text-5xl">{emoji}</div>
            <div>
                <p className="text-4xl font-bold text-white">{pct}%</p>
                <p className="text-white/50 mt-1">{correct} / {total} correct</p>
            </div>
            <div className="flex gap-3 justify-center">
                <Button onClick={onRetry} variant="outline" className="border-white/20 text-white hover:bg-white/5 gap-2">
                    <RefreshCw className="w-4 h-4" /> Retry
                </Button>
                <Button onClick={onBack} className="bg-blue-600 hover:bg-blue-700 text-white">
                    Done
                </Button>
            </div>
        </motion.div>
    )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const MODE_META: Record<Mode, { label: string; desc: string; icon: React.FC<any> }> = {
    flashcard: { label: 'Flashcard', desc: 'Tap to flip and reveal the definition', icon: BookOpen },
    quiz: { label: 'Multiple Choice', desc: 'Pick the correct word for the definition', icon: Brain },
    spelling: { label: 'Spelling', desc: 'Type the word from its definition', icon: Keyboard },
}

export default function PracticePage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [phase, setPhase] = useState<Phase>('pick')
    const [mode, setMode] = useState<Mode>('flashcard')
    const [wordCount, setWordCount] = useState(10)
    const [words, setWords] = useState<PracticeWord[]>([])
    const [sessionId, setSessionId] = useState<number | null>(null)
    const [results, setResults] = useState<{ correct: number; total: number } | null>(null)

    const { refetch: fetchWords, isFetching } = usePracticeWords(wordCount)
    const { mutate: createSession } = useCreateSession()
    const { mutate: completeSession } = useCompleteSession()

    const start = async () => {
        const res = await fetchWords()
        if (!res.data || res.data.length < 2) return
        setWords(res.data)
        createSession(mode, {
            onSuccess: (session: any) => setSessionId(session.id),
        })
        setPhase('session')
    }

    const handleDone = (correct: number, total: number) => {
        setResults({ correct, total })
        if (sessionId) {
            completeSession({ sessionId, total, correct })
        }
        setPhase('results')
    }

    const retry = async () => {
        setPhase('session')
        setResults(null)
        const res = await fetchWords()
        if (res.data) setWords(res.data)
        createSession(mode, {
            onSuccess: (session: any) => setSessionId(session.id),
        })
    }

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-10">
                    <button
                        onClick={() => phase === 'pick'
                            ? router.push(`/platform/${params.id}/learning`)
                            : setPhase('pick')
                        }
                        className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-2xl font-bold text-white">
                        {phase === 'pick' ? 'Practice' : phase === 'session' ? MODE_META[mode].label : 'Results'}
                    </h1>
                </motion.div>

                <AnimatePresence mode="wait">
                    {/* Mode picker */}
                    {phase === 'pick' && (
                        <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                            <div className="grid gap-3">
                                {(Object.entries(MODE_META) as [Mode, typeof MODE_META[Mode]][]).map(([m, meta]) => (
                                    <button
                                        key={m}
                                        onClick={() => setMode(m)}
                                        className={`p-4 rounded-xl border text-left transition-all flex items-center gap-4 ${
                                            mode === m
                                                ? 'border-blue-500/50 bg-blue-500/5'
                                                : 'border-white/10 bg-white/2.5 hover:border-white/20 hover:bg-white/5'
                                        }`}
                                    >
                                        <meta.icon className={`w-5 h-5 ${mode === m ? 'text-blue-400' : 'text-white/40'}`} />
                                        <div>
                                            <p className={`font-medium ${mode === m ? 'text-white' : 'text-white/70'}`}>{meta.label}</p>
                                            <p className="text-xs text-white/40 mt-0.5">{meta.desc}</p>
                                        </div>
                                        {mode === m && <Check className="w-4 h-4 text-blue-400 ml-auto" />}
                                    </button>
                                ))}
                            </div>

                            {/* Word count */}
                            <Card className="p-4 bg-white/2.5 border border-white/5">
                                <p className="text-sm text-white/60 mb-3">Words per session</p>
                                <div className="flex gap-2">
                                    {[5, 10, 20, 30].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setWordCount(n)}
                                            className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                                                wordCount === n
                                                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                                                    : 'border-white/10 text-white/50 hover:bg-white/5'
                                            }`}
                                        >{n}</button>
                                    ))}
                                </div>
                            </Card>

                            <Button onClick={start} disabled={isFetching} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base">
                                {isFetching ? 'Loading words…' : 'Start Practice'}
                            </Button>
                        </motion.div>
                    )}

                    {/* Active session */}
                    {phase === 'session' && (
                        <motion.div key="session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Session words={words} mode={mode} onDone={handleDone} />
                        </motion.div>
                    )}

                    {/* Results */}
                    {phase === 'results' && results && (
                        <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Results
                                correct={results.correct}
                                total={results.total}
                                mode={mode}
                                onRetry={retry}
                                onBack={() => router.push(`/platform/${params.id}/learning`)}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
