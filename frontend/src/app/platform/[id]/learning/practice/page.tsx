'use client'

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion'
import { ArrowLeft, Brain, BookOpen, Keyboard, RefreshCw, Check, X, Volume2, VolumeX, Shuffle, Zap, Headphones, Clock, AlertCircle, Flame, Type } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usePracticeWords, useSubmitResult, useCreateSession, useCompleteSession, useDueCounts, useDailyStreak, type PracticeWord } from '@/lib/hooks/use-practice'
import { useFolders, useModules } from '@/lib/hooks/use-dictionary'
import { playCorrect, playWrong, isSoundEnabled, setSoundEnabled, primeAudio } from '@/lib/utils/sounds'

type Mode = 'flashcard' | 'quiz' | 'spelling' | 'listening' | 'cloze'
type Phase = 'pick' | 'session' | 'chunk-review' | 'results'

// ── helpers ──────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.95
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
}

/** Levenshtein distance — cheap dynamic-programming, fine for short words. */
function levenshtein(a: string, b: string): number {
    if (a === b) return 0
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length
    const dp = Array.from({ length: a.length + 1 }, (_, i) => i)
    for (let j = 1; j <= b.length; j++) {
        let prev = dp[0]
        dp[0] = j
        for (let i = 1; i <= a.length; i++) {
            const tmp = dp[i]
            dp[i] = b[j - 1] === a[i - 1]
                ? prev
                : 1 + Math.min(prev, dp[i], dp[i - 1])
            prev = tmp
        }
    }
    return dp[a.length]
}

/**
 * "Close enough" tolerance for typed answers — exact match always wins;
 * for 5+ character words a single off-by-one typo is forgiven.
 */
function isCloseSpelling(input: string, target: string): { ok: boolean; exact: boolean } {
    const a = input.trim().toLowerCase()
    const b = target.toLowerCase()
    if (!a) return { ok: false, exact: false }
    if (a === b) return { ok: true, exact: true }
    // Off-by-one only counts when the word is long enough that a typo is
    // distinguishable from "wrong word" — guard short words to avoid
    // letting "cat" pass as "bat".
    if (b.length >= 5 && levenshtein(a, b) <= 1) return { ok: true, exact: false }
    return { ok: false, exact: false }
}

/**
 * Find the first example containing the target word (any case) and return
 * the prompt with that occurrence replaced by an underline blank.
 * Returns null when no usable example exists.
 */
function buildCloze(word: PracticeWord): { sentence: string; blank: string } | null {
    if (!word.examples) return null
    for (const ex of word.examples) {
        if (!ex) continue
        const rx = new RegExp(`\\b(${word.word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})\\b`, 'i')
        if (!rx.test(ex)) continue
        const blank = '_'.repeat(Math.max(word.word.length, 4))
        return { sentence: ex.replace(rx, blank), blank }
    }
    return null
}

const AUTO_TTS_KEY = 'practice:auto_tts'
function readAutoTts(): boolean {
    if (typeof window === 'undefined') return true
    try {
        const v = window.localStorage.getItem(AUTO_TTS_KEY)
        return v === null ? true : v === '1'
    } catch {
        return true
    }
}
function writeAutoTts(v: boolean) {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(AUTO_TTS_KEY, v ? '1' : '0')
    } catch { /* ignore quota / disabled storage */ }
}

// ── Flashcard (single card with drag + flip + TTS) ──────────────────────────

const SWIPE_THRESHOLD = 110

function Flashcard({
    word,
    flipped,
    onFlipToggle,
    onSwipe,
    exitDirection,
    autoTts,
}: {
    word: PracticeWord
    flipped: boolean
    onFlipToggle: () => void
    onSwipe: (dir: 1 | -1) => void
    exitDirection: 0 | 1 | -1
    autoTts: boolean
}) {
    const x = useMotionValue(0)
    const rotateZ = useTransform(x, [-220, 0, 220], [-14, 0, 14])
    const knowOpacity = useTransform(x, [40, 140], [0, 1])
    const learnOpacity = useTransform(x, [-140, -40], [1, 0])

    // Auto-pronounce when the card is revealed. Track flipped state so we
    // don't re-speak when the user manually toggles back (only on the
    // front→back transition).
    useEffect(() => {
        if (autoTts && flipped) speak(word.word)
    }, [autoTts, flipped, word.id, word.word])

    const exitTarget =
        exitDirection === 1 ? { x: 700, rotate: 30, opacity: 0 } :
        exitDirection === -1 ? { x: -700, rotate: -30, opacity: 0 } :
        { x: 0, rotate: 0, opacity: 1 }

    const handleDragEnd = (_: unknown, info: PanInfo) => {
        if (info.offset.x > SWIPE_THRESHOLD) onSwipe(1)
        else if (info.offset.x < -SWIPE_THRESHOLD) onSwipe(-1)
    }

    return (
        <motion.div
            className="relative w-full max-w-md h-72 cursor-grab active:cursor-grabbing perspective-1000 select-none touch-none"
            style={{ x, rotateZ }}
            drag={exitDirection === 0 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={handleDragEnd}
            animate={exitTarget}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        >
            {/* drag-direction tint overlays */}
            <motion.div
                className="absolute inset-0 rounded-2xl bg-green-500/20 pointer-events-none z-20 flex items-start justify-end p-4"
                style={{ opacity: knowOpacity }}
            >
                <div className="border-2 border-green-400 text-green-300 font-bold uppercase tracking-wide px-3 py-1 rounded-md rotate-12">
                    Know
                </div>
            </motion.div>
            <motion.div
                className="absolute inset-0 rounded-2xl bg-red-500/20 pointer-events-none z-20 flex items-start justify-start p-4"
                style={{ opacity: learnOpacity }}
            >
                <div className="border-2 border-red-400 text-red-300 font-bold uppercase tracking-wide px-3 py-1 rounded-md -rotate-12">
                    Still learning
                </div>
            </motion.div>

            {/* flip wrapper */}
            <motion.div
                className="relative w-full h-full"
                onClick={onFlipToggle}
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={{ duration: 0.45, ease: 'easeInOut' }}
                style={{ transformStyle: 'preserve-3d' }}
            >
                {/* Front */}
                <div className="absolute inset-0 backface-hidden bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center p-6">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); speak(word.word) }}
                        className="absolute top-3 right-3 p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors z-10"
                        aria-label="Pronounce"
                    >
                        <Volume2 className="w-4 h-4" />
                    </button>
                    <p className="text-3xl font-bold text-white text-center">{word.word}</p>
                    {word.phonetic && <p className="text-white/40 mt-2 text-sm">{word.phonetic}</p>}
                    <p className="text-white/30 text-xs mt-6">tap to reveal · swipe to answer</p>
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
        </motion.div>
    )
}

// ── stacked card behind (purely decorative) ─────────────────────────────────

function StackedPlaceholder({ depth }: { depth: 1 | 2 }) {
    const offsetY = depth === 1 ? 8 : 16
    const scale = depth === 1 ? 0.96 : 0.92
    const opacity = depth === 1 ? 0.55 : 0.3
    return (
        <div
            aria-hidden
            className="absolute w-full max-w-md h-72 bg-white/3 border border-white/10 rounded-2xl pointer-events-none"
            style={{ transform: `translateY(${offsetY}px) scale(${scale})`, opacity }}
        />
    )
}

// ── FlashcardSession (deck + piles + keyboard) ───────────────────────────────

function FlashcardSession({
    words,
    onCardDecided,
    onSessionEnd,
    drillStartIndex,
    drillTotal,
    autoTts,
}: {
    words: PracticeWord[]
    onCardDecided: (wordId: number, wasKnow: boolean) => void
    onSessionEnd: (knowIds: number[], learningIds: number[]) => void
    drillStartIndex: number
    drillTotal: number
    autoTts: boolean
}) {
    const [index, setIndex] = useState(0)
    const [flipped, setFlipped] = useState(false)
    const [know, setKnow] = useState<number[]>([])
    const [learning, setLearning] = useState<number[]>([])
    const [exit, setExit] = useState<0 | 1 | -1>(0)
    const lockRef = useRef(false)

    const word = words[index]

    const decide = useCallback((wasKnow: boolean) => {
        if (!word || lockRef.current) return
        lockRef.current = true
        setExit(wasKnow ? 1 : -1)
        // Audio feedback fires alongside the swipe-tint, so the cue lands
        // before the 320ms advance animation, not after it.
        // Skip the voice affirmation here — the next card's auto-TTS will
        // cancel any in-progress speech ~320ms later and chop the word
        // mid-syllable; the chime alone is enough for flashcard pacing.
        if (wasKnow) playCorrect({ voice: false })
        else playWrong({ voice: false })
        onCardDecided(word.id, wasKnow)
        const nextKnow = wasKnow ? [...know, word.id] : know
        const nextLearning = wasKnow ? learning : [...learning, word.id]
        setKnow(nextKnow)
        setLearning(nextLearning)
        setTimeout(() => {
            setFlipped(false)
            setExit(0)
            lockRef.current = false
            if (index + 1 >= words.length) {
                onSessionEnd(nextKnow, nextLearning)
            } else {
                setIndex(p => p + 1)
            }
        }, 320)
    }, [word, index, words.length, know, learning, onCardDecided, onSessionEnd])

    // keyboard: space = flip, ← = still learning, → = know
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
            if (e.key === ' ') {
                e.preventDefault()
                setFlipped(p => !p)
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                decide(false)
            } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                decide(true)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [decide])

    if (!word) return null
    const progress = (index / words.length) * 100

    return (
        <div className="flex flex-col items-center gap-7 w-full">
            {/* progress + pile counters */}
            <div className="w-full max-w-md">
                <div className="flex justify-between items-center text-[11px] sm:text-xs mb-1.5 gap-2">
                    <span className="text-white/50 truncate">
                        Round {index + 1} / {words.length}
                        <span className="text-white/30"> · Drill {drillStartIndex + index + 1} / {drillTotal}</span>
                    </span>
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <span className="flex items-center gap-1 text-red-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            {learning.length}
                        </span>
                        <span className="flex items-center gap-1 text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            {know.length}
                        </span>
                    </div>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-blue-500 rounded-full"
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>
            </div>

            {/* stacked cards */}
            <div className="relative w-full max-w-md h-72 flex items-center justify-center">
                {words[index + 2] && <StackedPlaceholder depth={2} />}
                {words[index + 1] && <StackedPlaceholder depth={1} />}
                <AnimatePresence mode="popLayout">
                    <motion.div
                        key={word.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute inset-0 flex items-center justify-center"
                    >
                        <Flashcard
                            word={word}
                            flipped={flipped}
                            onFlipToggle={() => setFlipped(p => !p)}
                            onSwipe={(d) => decide(d === 1)}
                            exitDirection={exit}
                            autoTts={autoTts}
                        />
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* manual buttons (still useful on desktop) */}
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-2 w-full max-w-md">
                <Button
                    onClick={() => decide(false)}
                    variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2"
                >
                    <X className="w-4 h-4" /> Still learning <span className="text-white/30 text-[10px] ml-1 hidden sm:inline">←</span>
                </Button>
                <Button
                    onClick={() => setFlipped(p => !p)}
                    variant="outline"
                    className="border-white/20 text-white/70 hover:bg-white/5 gap-2"
                >
                    Flip <span className="text-white/30 text-[10px] ml-1 hidden sm:inline">space</span>
                </Button>
                <Button
                    onClick={() => decide(true)}
                    className="bg-green-600 hover:bg-green-700 text-white gap-2"
                >
                    <Check className="w-4 h-4" /> Know <span className="text-white/60 text-[10px] ml-1 hidden sm:inline">→</span>
                </Button>
            </div>
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
        // Sound fires immediately with the colour change rather than after
        // the 800ms reveal pause — feedback feels snappier.
        if (correct) playCorrect()
        else playWrong()
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

    // Re-derived each render so the input border + "Close" hint use the same
    // verdict the submit handler will use.
    const verdict = isCloseSpelling(input, word.word)

    const submit = () => {
        if (!input.trim() || submitted) return
        setSubmitted(true)
        if (verdict.ok) playCorrect()
        else playWrong()
        setTimeout(() => onAnswer(verdict.ok), 900)
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
                            ? verdict.ok
                                ? (verdict.exact
                                    ? 'border-green-500/50 bg-green-500/5'
                                    : 'border-amber-400/50 bg-amber-400/5')
                                : 'border-red-500/50 bg-red-500/5'
                            : 'border-white/10 focus:border-white/25'
                    }`}
                />
                {submitted && verdict.ok && !verdict.exact && (
                    <p className="text-center text-sm text-amber-300/90">
                        Close — it&apos;s <span className="text-amber-200 font-semibold">{word.word}</span>
                    </p>
                )}
                {submitted && !verdict.ok && (
                    <p className="text-center text-sm text-white/50">
                        Correct: <span className="text-green-400 font-medium">{word.word}</span>
                    </p>
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

// ── Cloze (fill-the-blank using the word's example sentence) ────────────────

function Cloze({ word, onAnswer }: {
    word: PracticeWord
    onAnswer: (correct: boolean) => void
}) {
    const [input, setInput] = useState('')
    const [submitted, setSubmitted] = useState(false)

    // Build the cloze prompt once per word. If the word has no example
    // containing it, we degrade to a plain spelling prompt rather than
    // skipping — the caller already filters words without examples, but a
    // defensive fallback keeps the session from dead-ending.
    const built = useMemo(() => buildCloze(word), [word.id, word.word, word.examples])
    const verdict = isCloseSpelling(input, word.word)

    const submit = () => {
        if (!input.trim() || submitted) return
        setSubmitted(true)
        if (verdict.ok) playCorrect()
        else playWrong()
        setTimeout(() => onAnswer(verdict.ok), 900)
    }

    return (
        <div className="w-full max-w-md space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <p className="text-white/50 text-xs mb-3 text-center">Fill in the blank</p>
                {built ? (
                    <p className="text-white text-base leading-relaxed text-center">
                        &ldquo;{built.sentence}&rdquo;
                    </p>
                ) : (
                    <p className="text-white text-base leading-relaxed text-center">
                        {word.definition}
                    </p>
                )}
                {word.translation && (
                    <p className="text-blue-300/60 text-sm mt-3 text-center">{word.translation}</p>
                )}
            </div>

            <div className="space-y-3">
                <input
                    autoFocus
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    disabled={submitted}
                    placeholder="Type the missing word…"
                    className={`w-full px-4 py-3 rounded-xl border text-white text-center text-lg font-medium bg-white/5 focus:outline-none transition-colors ${
                        submitted
                            ? verdict.ok
                                ? (verdict.exact
                                    ? 'border-green-500/50 bg-green-500/5'
                                    : 'border-amber-400/50 bg-amber-400/5')
                                : 'border-red-500/50 bg-red-500/5'
                            : 'border-white/10 focus:border-white/25'
                    }`}
                />
                {submitted && verdict.ok && !verdict.exact && (
                    <p className="text-center text-sm text-amber-300/90">
                        Close — it&apos;s <span className="text-amber-200 font-semibold">{word.word}</span>
                    </p>
                )}
                {submitted && !verdict.ok && (
                    <p className="text-center text-sm text-white/50">
                        Correct: <span className="text-green-400 font-medium">{word.word}</span>
                    </p>
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

// ── Listening ────────────────────────────────────────────────────────────────

function Listening({ word, onAnswer }: {
    word: PracticeWord
    onAnswer: (correct: boolean) => void
}) {
    const [input, setInput] = useState('')
    const [submitted, setSubmitted] = useState(false)
    const [revealed, setRevealed] = useState(false)

    useEffect(() => {
        speak(word.word)
        // re-speak on every new word; cleanup not needed since speak() cancels prior utterance
    }, [word.id, word.word])

    const submit = () => {
        if (!input.trim() || submitted) return
        setSubmitted(true)
        const correct = input.trim().toLowerCase() === word.word.toLowerCase()
        if (correct) playCorrect()
        else playWrong()
        setTimeout(() => onAnswer(correct), 900)
    }

    return (
        <div className="w-full max-w-md space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
                <p className="text-white/50 text-xs">Listen and type the word</p>
                <button
                    type="button"
                    onClick={() => speak(word.word)}
                    className="mx-auto w-16 h-16 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 transition-all flex items-center justify-center"
                    aria-label="Replay audio"
                >
                    <Volume2 className="w-7 h-7" />
                </button>
                {revealed
                    ? <p className="text-white/60 text-sm">{word.definition}</p>
                    : <button type="button" onClick={() => setRevealed(true)} className="text-xs text-white/40 hover:text-white/70 underline underline-offset-2">Need a hint?</button>
                }
                {revealed && word.translation && <p className="text-blue-300/60 text-xs">{word.translation}</p>}
            </div>

            <div className="space-y-3">
                <input
                    autoFocus
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    disabled={submitted}
                    placeholder="Type what you heard…"
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

// ── Quiz/Spelling/Listening session wrapper (legacy correct-counter model) ──

function LegacySession({ words, mode, onDone, drillStartIndex, drillTotal }: {
    words: PracticeWord[]
    mode: Exclude<Mode, 'flashcard'>
    onDone: (correctIds: number[], missedIds: number[]) => void
    drillStartIndex: number
    drillTotal: number
}) {
    const [index, setIndex] = useState(0)
    const [correctIds, setCorrectIds] = useState<number[]>([])
    const [missedIds, setMissedIds] = useState<number[]>([])
    const { mutate: submitResult } = useSubmitResult()

    const word = words[index]
    const progress = ((index) / words.length) * 100

    const advance = useCallback((wasCorrect: boolean) => {
        submitResult({ wordId: word.id, wasCorrect })
        const nextCorrect = wasCorrect ? [...correctIds, word.id] : correctIds
        const nextMissed = wasCorrect ? missedIds : [...missedIds, word.id]
        if (wasCorrect) setCorrectIds(nextCorrect)
        else setMissedIds(nextMissed)
        if (index + 1 >= words.length) {
            onDone(nextCorrect, nextMissed)
        } else {
            setIndex(p => p + 1)
        }
    }, [word, index, correctIds, missedIds, words.length, onDone, submitResult])

    return (
        <div className="flex flex-col items-center gap-8">
            <div className="w-full max-w-md">
                <div className="flex justify-between text-[11px] sm:text-xs text-white/40 mb-1.5 gap-2">
                    <span className="truncate">
                        Round {index + 1} / {words.length}
                        <span className="text-white/30"> · Drill {drillStartIndex + index + 1} / {drillTotal}</span>
                    </span>
                    <span className="shrink-0">{correctIds.length} correct</span>
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
                    {mode === 'quiz' && <Quiz word={word} onAnswer={advance} />}
                    {mode === 'spelling' && <Spelling word={word} onAnswer={advance} />}
                    {mode === 'listening' && <Listening word={word} onAnswer={advance} />}
                    {mode === 'cloze' && <Cloze word={word} onAnswer={advance} />}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

// ── Chunk review (between batches when drilling a large scope) ──────────────

function ChunkReview({
    chunkSize,
    correctCount,
    missedWords,
    remainingTotal,
    onContinue,
    onStop,
}: {
    chunkSize: number
    correctCount: number
    missedWords: PracticeWord[]
    remainingTotal: number
    onContinue: () => void
    onStop: () => void
}) {
    const total = correctCount + missedWords.length
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="text-center">
                <p className="text-4xl font-bold text-white">{pct}%</p>
                <p className="text-white/50 mt-1">{correctCount} / {total} correct in this round</p>
                <p className="text-xs text-white/30 mt-2">
                    {remainingTotal > 0
                        ? `${remainingTotal} word${remainingTotal === 1 ? '' : 's'} still to drill — mistakes carry into the next round.`
                        : 'No more words queued — finish to see your results.'}
                </p>
            </div>

            {missedWords.length > 0 ? (
                <Card className="p-4 bg-amber-500/5 border border-amber-500/20">
                    <p className="text-sm text-amber-300/80 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {missedWords.length} word{missedWords.length === 1 ? '' : 's'} to review
                    </p>
                    <ul className="space-y-2">
                        {missedWords.map(w => (
                            <li key={w.id} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 text-sm">
                                <span className="text-amber-300 font-medium sm:min-w-[8rem] break-words">{w.word}</span>
                                <span className="text-white/60 flex-1 break-words">{w.definition}</span>
                            </li>
                        ))}
                    </ul>
                </Card>
            ) : (
                <Card className="p-4 bg-emerald-500/5 border border-emerald-500/20 text-center text-sm text-emerald-300/80">
                    Clean round — no mistakes this batch.
                </Card>
            )}

            <div className="flex flex-wrap gap-3 justify-center">
                {remainingTotal > 0 ? (
                    <Button onClick={onContinue} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                        Next {Math.min(chunkSize, remainingTotal)} words
                    </Button>
                ) : (
                    <Button onClick={onContinue} className="bg-blue-600 hover:bg-blue-700 text-white">
                        See results
                    </Button>
                )}
                <Button onClick={onStop} variant="outline" className="border-white/20 text-white/70 hover:bg-white/5">
                    Stop here
                </Button>
            </div>
        </motion.div>
    )
}

// ── Results ───────────────────────────────────────────────────────────────────

function Results({
    correct,
    total,
    mode,
    learningCount,
    onRetry,
    onShuffle,
    onReviewLearning,
    onBack,
}: {
    correct: number
    total: number
    mode: Mode
    learningCount: number
    onRetry: () => void
    onShuffle: () => void
    onReviewLearning?: () => void
    onBack: () => void
}) {
    const pct = total > 0 ? Math.round(correct / total * 100) : 0
    const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚'
    const missed = mode === 'flashcard' ? learningCount : total - correct

    return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6">
            <div className="text-5xl">{emoji}</div>
            <div>
                <p className="text-4xl font-bold text-white">{pct}%</p>
                <p className="text-white/50 mt-1">
                    {mode === 'flashcard'
                        ? `${correct} known · ${learningCount} still learning`
                        : `${correct} / ${total} correct`}
                </p>
                {missed > 0 && (
                    <p className="text-xs text-amber-300/70 mt-2">
                        The {missed} {missed === 1 ? 'word' : 'words'} you missed will come back at the top of your next session.
                    </p>
                )}
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
                {mode === 'flashcard' && learningCount > 0 && onReviewLearning && (
                    <Button onClick={onReviewLearning} className="bg-amber-500 hover:bg-amber-600 text-black gap-2">
                        <Zap className="w-4 h-4" /> Review still learning ({learningCount})
                    </Button>
                )}
                <Button onClick={onShuffle} variant="outline" className="border-white/20 text-white hover:bg-white/5 gap-2">
                    <Shuffle className="w-4 h-4" /> Shuffle
                </Button>
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

// ── Scope picker (folder/module) ─────────────────────────────────────────────

function ScopePicker({
    folderId, moduleId, onChange,
}: {
    folderId?: number
    moduleId?: number
    onChange: (folderId?: number, moduleId?: number) => void
}) {
    const { data: folders = [] } = useFolders()
    const { data: modules = [] } = useModules(folderId)

    const summary = (() => {
        if (!folderId) return 'All my words'
        const f = folders.find(x => x.id === folderId)
        if (!moduleId) return f ? `Folder · ${f.name}` : 'Folder'
        const m = modules.find(x => x.id === moduleId)
        return m ? `${f?.name ?? 'Folder'} / ${m.name}` : (f ? `Folder · ${f.name}` : 'Module')
    })()

    return (
        <Card className="p-4 bg-white/2.5 border border-white/5">
            <p className="text-sm text-white/60 mb-3">Practice from <span className="text-white/80">{summary}</span></p>

            <div className="flex gap-2 flex-wrap mb-3">
                <button
                    onClick={() => onChange(undefined, undefined)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                        !folderId
                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                            : 'border-white/10 text-white/50 hover:bg-white/5'
                    }`}
                >All words</button>
                {folders.map(f => (
                    <button key={f.id}
                        onClick={() => onChange(f.id, undefined)}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                            folderId === f.id && !moduleId
                                ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                                : 'border-white/10 text-white/50 hover:bg-white/5'
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
                            onClick={() => onChange(folderId, moduleId === m.id ? undefined : m.id)}
                            className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                                moduleId === m.id
                                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                                    : 'border-white/10 text-white/40 hover:bg-white/5'
                            }`}
                        >{m.name} <span className="text-white/30">· {m.word_count}</span></button>
                    ))}
                </div>
            )}
        </Card>
    )
}

// ── Main page ────────────────────────────────────────────────────────────────

const MODE_META: Record<Mode, { label: string; desc: string; icon: React.FC<{ className?: string }> }> = {
    flashcard: { label: 'Flashcard', desc: 'Swipe right if you know, left to review', icon: BookOpen },
    quiz: { label: 'Multiple Choice', desc: 'Pick the correct word for the definition', icon: Brain },
    spelling: { label: 'Spelling', desc: 'Type the word from its definition', icon: Keyboard },
    listening: { label: 'Listening', desc: 'Hear the word, type what you hear', icon: Headphones },
    cloze: { label: 'Cloze (fill blank)', desc: 'Type the missing word in an example sentence', icon: Type },
}

export default function PracticePage() {
    return (
        <Suspense fallback={null}>
            <PracticePageInner />
        </Suspense>
    )
}

function PracticePageInner() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    // Reading the scope from the URL lets entry points like "Practice this
    // module" on a dictionary module page deep-link straight into a
    // pre-scoped session. Parsed once at mount so subsequent in-page
    // scope changes own the state — no fighting between the URL and clicks.
    const searchParams = useSearchParams()
    const initialFolderFromUrl = useMemo(() => {
        const raw = searchParams?.get('folder')
        const n = raw ? Number(raw) : NaN
        return Number.isFinite(n) && n > 0 ? n : undefined
    }, [searchParams])
    const initialModuleFromUrl = useMemo(() => {
        const raw = searchParams?.get('module')
        const n = raw ? Number(raw) : NaN
        return Number.isFinite(n) && n > 0 ? n : undefined
    }, [searchParams])

    // Fixed: a round is always 10 words. The drill always covers the full
    // chosen scope; "rounds" are just review checkpoints inside that drill.
    const chunkSize = 10

    const [phase, setPhase] = useState<Phase>('pick')
    const [mode, setMode] = useState<Mode>('flashcard')
    const [words, setWords] = useState<PracticeWord[]>([])
    const [originalWords, setOriginalWords] = useState<PracticeWord[]>([])
    const [unseenQueue, setUnseenQueue] = useState<PracticeWord[]>([])
    const [mistakesPool, setMistakesPool] = useState<PracticeWord[]>([])
    const [sessionId, setSessionId] = useState<number | null>(null)
    const [results, setResults] = useState<{ correct: number; total: number; learningIds: number[] } | null>(null)
    const [lastChunk, setLastChunk] = useState<{ correctCount: number; missedWords: PracticeWord[] } | null>(null)
    const [aggregate, setAggregate] = useState<{ correct: number; total: number; missedIds: Set<number> }>({
        correct: 0, total: 0, missedIds: new Set<number>(),
    })
    const [startError, setStartError] = useState<string | null>(null)

    const [scopeFolderId, setScopeFolderId] = useState<number | undefined>(initialFolderFromUrl)
    const [scopeModuleId, setScopeModuleId] = useState<number | undefined>(initialModuleFromUrl)
    const [dueOnly, setDueOnly] = useState(false)
    const [weakOnly, setWeakOnly] = useState(false)
    const [autoTts, setAutoTts] = useState<boolean>(() => readAutoTts())
    useEffect(() => { writeAutoTts(autoTts) }, [autoTts])
    const [sfx, setSfx] = useState<boolean>(() => isSoundEnabled())
    useEffect(() => { setSoundEnabled(sfx) }, [sfx])

    // Surface motivational signals on the entry screen.
    const { streak, practicedToday } = useDailyStreak()
    const { data: dueCounts } = useDueCounts({
        folderId: scopeModuleId ? undefined : scopeFolderId,
        moduleId: scopeModuleId,
    })
    // Always pull the full scope so chunking + mistake carry-forward can
    // walk the entire pool from a single fetch. Backend cap is 1000.
    const { refetch: fetchWords, isFetching } = usePracticeWords({
        count: 1000,
        moduleId: scopeModuleId,
        folderId: scopeModuleId ? undefined : scopeFolderId,
        dueOnly,
        weakOnly,
    })
    const { mutate: createSession } = useCreateSession()
    const { mutate: completeSession } = useCompleteSession()
    const { mutate: submitResult } = useSubmitResult()

    const wordsById = useMemo(() => {
        const m = new Map<number, PracticeWord>()
        for (const w of originalWords) m.set(w.id, w)
        return m
    }, [originalWords])

    // Pull next chunk: mistakes from earlier rounds first (so they recur
    // immediately), then fill remaining slots with fresh words.
    const takeChunk = useCallback((
        unseen: PracticeWord[],
        pool: PracticeWord[],
        size: number,
    ): { chunk: PracticeWord[]; unseenRest: PracticeWord[]; poolRest: PracticeWord[] } => {
        const fromPool = pool.slice(0, size)
        const remaining = size - fromPool.length
        const fromUnseen = remaining > 0 ? unseen.slice(0, remaining) : []
        return {
            chunk: [...fromPool, ...fromUnseen],
            poolRest: pool.slice(fromPool.length),
            unseenRest: unseen.slice(fromUnseen.length),
        }
    }, [])

    const startChunk = (chunk: PracticeWord[]) => {
        setWords(chunk)
        // One backend "session" record per drill run is enough; only create
        // it on the very first chunk so the completion stats roll up cleanly.
        if (!sessionId) {
            createSession(mode, { onSuccess: (session: { id: number }) => setSessionId(session.id) })
        }
        setPhase('session')
    }

    const start = async () => {
        // Wake the audio context inside the user gesture that started the
        // drill, so the very first answer-feedback tone plays without the
        // resume-roundtrip latency that would otherwise drop the leading
        // note of the arpeggio.
        primeAudio()
        setStartError(null)
        const res = await fetchWords()
        if (res.error) {
            setStartError((res.error as Error).message || 'Could not load practice words')
            return
        }
        if (!res.data || res.data.length < 2) {
            setStartError('Add at least 2 words to your dictionary first.')
            return
        }
        // Cloze needs an example sentence that actually contains the word.
        // Pre-filter so we don't dead-end mid-drill on words that have no
        // usable example — and surface a clear message when the scope has
        // too few cloze-ready words.
        let pool = res.data
        if (mode === 'cloze') {
            pool = pool.filter(w => buildCloze(w) !== null)
            if (pool.length < 2) {
                setStartError('Cloze needs example sentences. Add examples to at least 2 words in this scope.')
                return
            }
        }
        const fresh = shuffleArray(pool)
        setOriginalWords(fresh)
        setSessionId(null)
        setResults(null)
        setLastChunk(null)
        setAggregate({ correct: 0, total: 0, missedIds: new Set<number>() })
        const { chunk, unseenRest, poolRest } = takeChunk(fresh, [], chunkSize)
        setUnseenQueue(unseenRest)
        setMistakesPool(poolRest)
        startChunk(chunk)
    }

    const finishRun = useCallback((finalAggregate: { correct: number; total: number; missedIds: Set<number> }) => {
        const learningIds = Array.from(finalAggregate.missedIds)
        setResults({
            correct: finalAggregate.correct,
            total: finalAggregate.total,
            learningIds,
        })
        if (sessionId) completeSession({
            sessionId,
            total: finalAggregate.total,
            correct: finalAggregate.correct,
        })
        setPhase('results')
    }, [completeSession, sessionId])

    const handleChunkComplete = useCallback((correctIds: number[], missedIds: number[]) => {
        const correctSet = new Set(correctIds)
        const missedSet = new Set(missedIds)

        // Drop now-correct words from the carry-forward pool; add any new
        // misses (deduped by id) so each word retries until it lands.
        const trimmedPool = mistakesPool.filter(w => !correctSet.has(w.id))
        const poolIds = new Set(trimmedPool.map(w => w.id))
        const additions: PracticeWord[] = []
        for (const id of missedIds) {
            if (poolIds.has(id)) continue
            const w = wordsById.get(id)
            if (w) {
                additions.push(w)
                poolIds.add(id)
            }
        }
        const nextPool = [...trimmedPool, ...additions]

        // Aggregate run-wide stats. missedIds tracks any word that was
        // wrong at least once across the whole drill — useful for the
        // "review still learning" follow-up.
        const nextAggregate = {
            correct: aggregate.correct + correctIds.length,
            total: aggregate.total + correctIds.length + missedIds.length,
            missedIds: new Set(aggregate.missedIds),
        }
        for (const id of missedSet) nextAggregate.missedIds.add(id)
        for (const id of correctSet) {
            // A word answered correctly here exits the "still learning" set
            // — it can re-enter only if missed again later.
            nextAggregate.missedIds.delete(id)
        }
        setAggregate(nextAggregate)
        setMistakesPool(nextPool)

        const missedWords = missedIds
            .map(id => wordsById.get(id))
            .filter((w): w is PracticeWord => Boolean(w))
        setLastChunk({ correctCount: correctIds.length, missedWords })

        if (unseenQueue.length === 0 && nextPool.length === 0) {
            finishRun(nextAggregate)
            return
        }
        setPhase('chunk-review')
    }, [aggregate, mistakesPool, unseenQueue, wordsById, finishRun])

    const continueChunk = () => {
        if (unseenQueue.length === 0 && mistakesPool.length === 0) {
            finishRun(aggregate)
            return
        }
        const { chunk, unseenRest, poolRest } = takeChunk(unseenQueue, mistakesPool, chunkSize)
        setUnseenQueue(unseenRest)
        setMistakesPool(poolRest)
        setLastChunk(null)
        startChunk(chunk)
    }

    const stopHere = () => finishRun(aggregate)

    const handleFlashcardDone = (knowIds: number[], learningIds: number[]) => {
        handleChunkComplete(knowIds, learningIds)
    }

    const handleLegacyDone = (correctIds: number[], missedIds: number[]) => {
        handleChunkComplete(correctIds, missedIds)
    }

    const retry = () => {
        // Restart the whole drill from the original pool.
        setSessionId(null)
        setResults(null)
        setLastChunk(null)
        setAggregate({ correct: 0, total: 0, missedIds: new Set<number>() })
        const { chunk, unseenRest, poolRest } = takeChunk(originalWords, [], chunkSize)
        setUnseenQueue(unseenRest)
        setMistakesPool(poolRest)
        startChunk(chunk)
    }
    const shuffle = () => {
        setSessionId(null)
        setResults(null)
        setLastChunk(null)
        setAggregate({ correct: 0, total: 0, missedIds: new Set<number>() })
        const reshuffled = shuffleArray(originalWords)
        const { chunk, unseenRest, poolRest } = takeChunk(reshuffled, [], chunkSize)
        setUnseenQueue(unseenRest)
        setMistakesPool(poolRest)
        startChunk(chunk)
    }
    const reviewLearning = () => {
        if (!results) return
        const deck = results.learningIds
            .map(id => wordsById.get(id))
            .filter((w): w is PracticeWord => Boolean(w))
        if (deck.length === 0) return
        const shuffled = shuffleArray(deck)
        setSessionId(null)
        setResults(null)
        setLastChunk(null)
        setAggregate({ correct: 0, total: 0, missedIds: new Set<number>() })
        const { chunk, unseenRest, poolRest } = takeChunk(shuffled, [], chunkSize)
        setUnseenQueue(unseenRest)
        setMistakesPool(poolRest)
        startChunk(chunk)
    }

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 sm:gap-4 mb-6 sm:mb-10">
                    <button
                        onClick={() => phase === 'pick'
                            ? router.push(`/platform/${params.id}/learning`)
                            : setPhase('pick')
                        }
                        className="p-2 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-all shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-xl sm:text-2xl font-bold text-white truncate">
                        {phase === 'pick'
                            ? 'Practice'
                            : phase === 'session'
                                ? MODE_META[mode].label
                                : phase === 'chunk-review'
                                    ? 'Round review'
                                    : 'Results'}
                    </h1>

                    {/* Motivational chips — only on the entry screen so they
                        don't compete with in-session focus. */}
                    {phase === 'pick' && (
                        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
                            {streak > 0 && (
                                <span
                                    title={practicedToday
                                        ? `${streak}-day streak — keep it alive`
                                        : `${streak}-day streak — practice today to keep it`}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${
                                        practicedToday
                                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                                            : 'border-white/15 bg-white/5 text-white/60'
                                    }`}
                                >
                                    <Flame className={`w-3.5 h-3.5 ${practicedToday ? 'text-amber-300' : 'text-white/40'}`} />
                                    {streak}
                                </span>
                            )}
                            {dueCounts && dueCounts.due > 0 && (
                                <span
                                    title="Words whose review interval has elapsed"
                                    className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                >
                                    <Clock className="w-3.5 h-3.5" />
                                    {dueCounts.due} due
                                </span>
                            )}
                        </div>
                    )}
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

                            <ScopePicker
                                folderId={scopeFolderId}
                                moduleId={scopeModuleId}
                                onChange={(f, m) => { setScopeFolderId(f); setScopeModuleId(m) }}
                            />

                            {/* Filter toggles: due-today + weak-words */}
                            <Card className="p-4 bg-white/2.5 border border-white/5">
                                <p className="text-sm text-white/60 mb-3">Pick from</p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => { setDueOnly(false); setWeakOnly(false) }}
                                        className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                            !dueOnly && !weakOnly
                                                ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                                                : 'border-white/10 text-white/50 hover:bg-white/5'
                                        }`}
                                    >All words</button>
                                    <button
                                        onClick={() => { setDueOnly(true); setWeakOnly(false) }}
                                        className={`px-3 py-1.5 rounded-lg text-xs border transition-all flex items-center gap-1.5 ${
                                            dueOnly
                                                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                                                : 'border-white/10 text-white/50 hover:bg-white/5'
                                        }`}
                                    >
                                        <Clock className="w-3 h-3" /> Due for review
                                        {dueCounts && dueCounts.due > 0 && (
                                            <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                                                dueOnly ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-white/60'
                                            }`}>{dueCounts.due}</span>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => { setWeakOnly(true); setDueOnly(false) }}
                                        className={`px-3 py-1.5 rounded-lg text-xs border transition-all flex items-center gap-1.5 ${
                                            weakOnly
                                                ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                                                : 'border-white/10 text-white/50 hover:bg-white/5'
                                        }`}
                                    ><AlertCircle className="w-3 h-3" /> Weak words</button>
                                </div>
                                <p className="text-xs text-white/30 mt-2">
                                    {dueOnly && 'Only words whose review interval has elapsed (or never reviewed).'}
                                    {weakOnly && 'Only words with accuracy below 70% or never reviewed.'}
                                    {!dueOnly && !weakOnly && 'Random selection from your full dictionary scope.'}
                                </p>
                            </Card>

                            {/* Drill rules — full scope, 10-word review rounds */}
                            <Card className="p-4 bg-white/2.5 border border-white/5">
                                <p className="text-sm text-white/60 mb-1">How the drill runs</p>
                                <p className="text-xs text-white/30">
                                    Every session covers all words in your chosen scope. After each 10 words you see your mistakes; those words come back in the next round until you get them right.
                                </p>
                            </Card>

                            {/* Audio preferences. SFX toggle applies to all
                                modes; auto-pronounce is only meaningful in
                                flashcard mode and stays scoped to it. */}
                            <Card className="p-4 bg-white/2.5 border border-white/5 space-y-3">
                                <label className="flex items-center justify-between gap-3 cursor-pointer">
                                    <span className="flex items-center gap-2 text-sm text-white/70">
                                        {sfx
                                            ? <Volume2 className="w-4 h-4 text-blue-300" />
                                            : <VolumeX className="w-4 h-4 text-white/40" />}
                                        Sound effects
                                    </span>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={sfx}
                                        onClick={() => {
                                            // Unlock audio inside the same gesture that
                                            // flips the switch so the preview tone plays.
                                            primeAudio()
                                            setSfx(v => {
                                                const next = !v
                                                // Fire a preview tone when turning ON so the
                                                // user knows what to expect.
                                                if (next) playCorrect()
                                                return next
                                            })
                                        }}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                            sfx ? 'bg-blue-500' : 'bg-white/10'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                sfx ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </label>

                                {mode === 'flashcard' && (
                                    <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-white/5">
                                        <span className="flex items-center gap-2 text-sm text-white/70">
                                            <Volume2 className="w-4 h-4 text-blue-300" />
                                            Pronounce on reveal
                                        </span>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={autoTts}
                                            onClick={() => setAutoTts(v => !v)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                autoTts ? 'bg-blue-500' : 'bg-white/10'
                                            }`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                    autoTts ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                            />
                                        </button>
                                    </label>
                                )}
                            </Card>

                            {startError && (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
                                    <div className="flex-1">
                                        <p className="text-amber-300 text-sm font-medium">{startError}</p>
                                        <p className="text-white/50 text-xs mt-1">Practice needs words from your dictionary.</p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => router.push(`/platform/${params.id}/learning/dictionary`)}
                                        className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 shrink-0"
                                    >
                                        Add words
                                    </Button>
                                </div>
                            )}

                            <Button onClick={start} disabled={isFetching} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base">
                                {isFetching ? 'Loading words…' : 'Start Practice'}
                            </Button>
                        </motion.div>
                    )}

                    {/* Active session */}
                    {phase === 'session' && (() => {
                        // Drill counter aggregates the whole walk: prior answers
                        // + this chunk + still-queued + carry-forward mistakes.
                        // Stays stable for the duration of the current chunk so
                        // the bar doesn't lurch as users answer.
                        const drillStartIndex = aggregate.total
                        const drillTotal = aggregate.total + words.length + unseenQueue.length + mistakesPool.length
                        return (
                            <motion.div key="session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                {mode === 'flashcard' ? (
                                    <FlashcardSession
                                        key={`fs-${words.map(w => w.id).join('-')}`}
                                        words={words}
                                        onCardDecided={(wordId, wasKnow) => submitResult({ wordId, wasCorrect: wasKnow })}
                                        onSessionEnd={handleFlashcardDone}
                                        drillStartIndex={drillStartIndex}
                                        drillTotal={drillTotal}
                                        autoTts={autoTts}
                                    />
                                ) : (
                                    <LegacySession
                                        key={`ls-${words.map(w => w.id).join('-')}`}
                                        words={words}
                                        mode={mode}
                                        onDone={handleLegacyDone}
                                        drillStartIndex={drillStartIndex}
                                        drillTotal={drillTotal}
                                    />
                                )}
                            </motion.div>
                        )
                    })()}

                    {/* Mid-drill review (between batches) */}
                    {phase === 'chunk-review' && lastChunk && (
                        <motion.div key="chunk-review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <ChunkReview
                                chunkSize={chunkSize}
                                correctCount={lastChunk.correctCount}
                                missedWords={lastChunk.missedWords}
                                remainingTotal={unseenQueue.length + mistakesPool.length}
                                onContinue={continueChunk}
                                onStop={stopHere}
                            />
                        </motion.div>
                    )}

                    {/* Results */}
                    {phase === 'results' && results && (
                        <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Results
                                correct={results.correct}
                                total={results.total}
                                mode={mode}
                                learningCount={results.learningIds.length}
                                onRetry={retry}
                                onShuffle={shuffle}
                                onReviewLearning={results.learningIds.length > 0 ? reviewLearning : undefined}
                                onBack={() => router.push(`/platform/${params.id}/learning`)}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
