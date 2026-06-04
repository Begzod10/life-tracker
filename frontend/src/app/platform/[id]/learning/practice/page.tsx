'use client'

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion'
import { ArrowLeft, Brain, BookOpen, Keyboard, RefreshCw, Check, X, Volume2, Shuffle, Zap, Headphones, Clock, AlertCircle, Flame, Type, Play, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    usePracticeWords,
    usePracticeWordsByIds,
    useWordPreview,
    useSubmitResult,
    useCreateSession,
    useCompleteSession,
    useDueCounts,
    useDailyStreak,
    useActiveSession,
    useUpdateSessionProgress,
    useDiscardSession,
    type PracticeWord,
    type PracticeProgress,
    type PracticeGrade,
} from '@/lib/hooks/use-practice'
import { useFolders, useModules } from '@/lib/hooks/use-dictionary'
import { playCorrect, playWrong, playCheckpoint, playComplete, primeAudio } from '@/lib/utils/sounds'
import { fetchWithAuth } from '@/lib/api/fetch-with-auth'
import { API_ENDPOINTS } from '@/lib/api/endpoints'

// Server-side AI judge for typed spelling answers — used only when the local
// matcher rejects an answer. Catches near-equivalents the static rules miss
// (synonyms outside the definition, "it is argued" vs "it is argued that",
// etc.). Returns null on any network/HTTP error so the caller can fall back
// to "wrong" without surfacing the AI dependency to the learner.
async function judgeTypedAnswer(
    userInput: string,
    target: string,
    definition: string | null | undefined,
): Promise<{ ok: boolean; verdict: 'yes' | 'close' | 'no' } | null> {
    try {
        const res = await fetchWithAuth(API_ENDPOINTS.PRACTICE.JUDGE_ANSWER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_input: userInput,
                target,
                definition: definition || undefined,
            }),
        })
        if (!res.ok) return null
        const data = await res.json() as { ok: boolean; verdict: string }
        const v = data.verdict === 'yes' || data.verdict === 'close' ? data.verdict : 'no'
        return { ok: !!data.ok, verdict: v }
    } catch {
        return null
    }
}

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
 * Spelling-mode answer check that also accepts synonyms parsed from the
 * definition (e.g. "persistence / perseverance / resilience"). The target
 * word is still the "true" answer surfaced in feedback — synonyms are
 * accepted as exact-only (no fuzz), and the target keeps its off-by-one
 * tolerance. Returns `matchedSynonym` when the user hit a synonym instead
 * of the target so the UI can reveal what the real word was.
 */
function isAcceptableSpelling(
    input: string,
    target: string,
    definition: string | undefined | null,
): { ok: boolean; exact: boolean; matchedSynonym?: string } {
    const a = input.trim().toLowerCase()
    if (!a) return { ok: false, exact: false }

    const t = target.toLowerCase()
    if (a === t) return { ok: true, exact: true }

    // Synonyms: every token in the definition split on common delimiters
    // (/, comma, semicolon, pipe). Exact match only — fuzz on multi-word
    // phrases like "strong willpower" would be too permissive.
    const def = (definition || '').toLowerCase()
    for (const raw of def.split(/[\/,;|]/)) {
        const syn = raw.trim()
        if (!syn || syn === t) continue
        if (a === syn) return { ok: true, exact: true, matchedSynonym: syn }
    }

    // Off-by-one against the target only.
    if (t.length >= 5 && levenshtein(a, t) <= 1) return { ok: true, exact: false }
    return { ok: false, exact: false }
}

/**
 * Build the cloze prompt. Prefers the original sentence captured when
 * the word was saved from the reader — that's the user's strongest
 * recall cue. Falls back to scanning AI-generated examples for one
 * that actually contains the target word.
 *
 * The returned `source` lets the UI label where the sentence came
 * from ("from your reading" vs an example) so the learner knows when
 * they're being shown the original passage.
 */
function buildCloze(
    word: PracticeWord,
): { sentence: string; blank: string; source: 'reading' | 'example' } | null {
    const rx = new RegExp(
        `\\b(${word.word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})\\b`,
        'i',
    )
    const blank = '_'.repeat(Math.max(word.word.length, 4))

    const sourceSentence = (word.source_sentence || '').trim()
    if (sourceSentence && rx.test(sourceSentence)) {
        return { sentence: sourceSentence.replace(rx, blank), blank, source: 'reading' }
    }

    if (word.examples) {
        for (const ex of word.examples) {
            if (!ex) continue
            if (!rx.test(ex)) continue
            return { sentence: ex.replace(rx, blank), blank, source: 'example' }
        }
    }
    return null
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
    initialPosition,
    onPositionChange,
}: {
    words: PracticeWord[]
    onCardDecided: (wordId: number, wasKnow: boolean) => void
    onSessionEnd: (knowIds: number[], learningIds: number[]) => void
    drillStartIndex: number
    drillTotal: number
    autoTts: boolean
    initialPosition?: {
        index: number
        knowIds?: number[]
        learningIds?: number[]
    }
    onPositionChange?: (pos: {
        index: number
        knowIds: number[]
        learningIds: number[]
    }) => void
}) {
    const [index, setIndex] = useState(initialPosition?.index ?? 0)
    const [flipped, setFlipped] = useState(false)
    const [know, setKnow] = useState<number[]>(initialPosition?.knowIds ?? [])
    const [learning, setLearning] = useState<number[]>(initialPosition?.learningIds ?? [])
    const [exit, setExit] = useState<0 | 1 | -1>(0)
    const lockRef = useRef(false)

    const word = words[index]

    const decide = useCallback((wasKnow: boolean) => {
        if (!word || lockRef.current) return
        lockRef.current = true
        setExit(wasKnow ? 1 : -1)
        // Audio feedback fires alongside the swipe-tint, so the cue lands
        // before the 320ms advance animation, not after it.
        if (wasKnow) playCorrect()
        else playWrong()
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
                onPositionChange?.({ index: words.length, knowIds: nextKnow, learningIds: nextLearning })
                onSessionEnd(nextKnow, nextLearning)
            } else {
                const nextIndex = index + 1
                setIndex(nextIndex)
                onPositionChange?.({ index: nextIndex, knowIds: nextKnow, learningIds: nextLearning })
            }
        }, 320)
    }, [word, index, words.length, know, learning, onCardDecided, onSessionEnd, onPositionChange])

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
    onAnswer: (correct: boolean, verdict: { ok: boolean; exact: boolean }) => void
}) {
    const [input, setInput] = useState('')
    const [submitted, setSubmitted] = useState(false)
    const [revealed, setRevealed] = useState(false)
    const [judging, setJudging] = useState(false)
    // When true the answer was wrong — pause auto-advance and wait for the
    // user to click Continue so they have time to read the correct word.
    const [awaitingContinue, setAwaitingContinue] = useState(false)
    const [finalVerdict, setFinalVerdict] = useState<{
        ok: boolean
        exact: boolean
        matchedSynonym?: string
        aiAccepted?: boolean
    } | null>(null)

    const localVerdict = isAcceptableSpelling(input, word.word, word.definition)
    const verdict: { ok: boolean; exact: boolean; matchedSynonym?: string; aiAccepted?: boolean } =
        finalVerdict ?? localVerdict

    const submit = async () => {
        if (!input.trim() || submitted || judging) return

        if (localVerdict.ok || input.trim().length < 2) {
            setSubmitted(true)
            setFinalVerdict(localVerdict)
            if (localVerdict.ok) {
                playCorrect()
                setTimeout(() => onAnswer(true, localVerdict), 900)
            } else {
                playWrong()
                setAwaitingContinue(true)
            }
            return
        }

        setJudging(true)
        const ai = await judgeTypedAnswer(input, word.word, word.definition)
        setJudging(false)
        setSubmitted(true)

        if (ai && ai.ok) {
            const v = { ok: true, exact: ai.verdict === 'yes', aiAccepted: true }
            setFinalVerdict(v)
            playCorrect()
            setTimeout(() => onAnswer(true, { ok: true, exact: v.exact }), 900)
        } else {
            setFinalVerdict(localVerdict)
            playWrong()
            setAwaitingContinue(true)
        }
    }

    const showAnswer = () => {
        if (submitted || judging) return
        setSubmitted(true)
        setRevealed(true)
        setFinalVerdict({ ok: false, exact: false })
        playWrong()
        setAwaitingContinue(true)
    }

    const continueToNext = () => {
        const v = finalVerdict ?? { ok: false, exact: false }
        onAnswer(v.ok, { ok: v.ok, exact: v.exact })
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
                    onKeyDown={e => e.key === 'Enter' && !awaitingContinue && submit()}
                    disabled={submitted}
                    placeholder="Type the word…"
                    className={`w-full px-4 py-3 rounded-xl border text-white text-center text-lg font-medium bg-white/5 focus:outline-none transition-colors ${
                        submitted
                            ? revealed
                                ? 'border-amber-400/40 bg-amber-400/5'
                                : verdict.ok
                                    ? (verdict.exact
                                        ? 'border-green-500/50 bg-green-500/5'
                                        : 'border-amber-400/50 bg-amber-400/5')
                                    : 'border-red-500/50 bg-red-500/5'
                            : 'border-white/10 focus:border-white/25'
                    }`}
                />
                {submitted && revealed && (
                    <p className="text-center text-sm text-amber-300/90">
                        Answer: <span className="text-amber-200 font-semibold">{word.word}</span>
                    </p>
                )}
                {submitted && !revealed && verdict.ok && verdict.aiAccepted && (
                    <p className="text-center text-sm text-green-300/90">
                        Accepted — target was <span className="text-green-200 font-semibold">{word.word}</span>
                    </p>
                )}
                {submitted && !revealed && verdict.ok && verdict.matchedSynonym && !verdict.aiAccepted && (
                    <p className="text-center text-sm text-green-300/90">
                        Synonym — target was <span className="text-green-200 font-semibold">{word.word}</span>
                    </p>
                )}
                {submitted && !revealed && verdict.ok && !verdict.exact && !verdict.matchedSynonym && !verdict.aiAccepted && (
                    <p className="text-center text-sm text-amber-300/90">
                        Close — it&apos;s <span className="text-amber-200 font-semibold">{word.word}</span>
                    </p>
                )}
                {submitted && !revealed && !verdict.ok && (
                    <p className="text-center text-sm text-white/50">
                        Correct: <span className="text-green-400 font-medium">{word.word}</span>
                    </p>
                )}
                {!submitted && (
                    <div className="space-y-2">
                        <Button
                            onClick={submit}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={!input.trim() || judging}
                        >
                            {judging ? 'Checking…' : 'Check'}
                        </Button>
                        <button
                            type="button"
                            onClick={showAnswer}
                            disabled={judging}
                            className="w-full text-xs text-white/40 hover:text-white/70 underline underline-offset-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Show answer
                        </button>
                    </div>
                )}
                {awaitingContinue && (
                    <Button
                        onClick={continueToNext}
                        className="w-full bg-white/10 hover:bg-white/15 text-white border border-white/20"
                    >
                        Continue →
                    </Button>
                )}
            </div>
        </div>
    )
}

// ── Cloze (fill-the-blank using the word's example sentence) ────────────────

function Cloze({ word, onAnswer }: {
    word: PracticeWord
    onAnswer: (correct: boolean, verdict: { ok: boolean; exact: boolean }) => void
}) {
    const [input, setInput] = useState('')
    const [submitted, setSubmitted] = useState(false)
    const [awaitingContinue, setAwaitingContinue] = useState(false)

    // Build the cloze prompt once per word. If the word has no example
    // containing it, we degrade to a plain spelling prompt rather than
    // skipping — the caller already filters words without examples, but a
    // defensive fallback keeps the session from dead-ending.
    const built = useMemo(
        () => buildCloze(word),
        // source_sentence is the strongest cue and should retrigger
        // the build when it changes (e.g. cross-tab edit).
        [word.id, word.word, word.examples, word.source_sentence],
    )
    const verdict = isCloseSpelling(input, word.word)

    const submit = () => {
        if (!input.trim() || submitted) return
        setSubmitted(true)
        if (verdict.ok) {
            playCorrect()
            setTimeout(() => onAnswer(true, verdict), 900)
        } else {
            playWrong()
            setAwaitingContinue(true)
        }
    }

    return (
        <div className="w-full max-w-md space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <p className="text-white/50 text-xs mb-3 text-center">
                    {built?.source === 'reading'
                        ? 'From your reading'
                        : 'Fill in the blank'}
                </p>
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
                    onKeyDown={e => e.key === 'Enter' && !awaitingContinue && submit()}
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
                {awaitingContinue && (
                    <Button
                        onClick={() => onAnswer(false, verdict)}
                        className="w-full bg-white/10 hover:bg-white/15 text-white border border-white/20"
                    >
                        Continue →
                    </Button>
                )}
            </div>
        </div>
    )
}

// ── Listening ────────────────────────────────────────────────────────────────

function Listening({ word, onAnswer }: {
    word: PracticeWord
    onAnswer: (correct: boolean, verdict: { ok: boolean; exact: boolean }) => void
}) {
    const [input, setInput] = useState('')
    const [submitted, setSubmitted] = useState(false)
    const [revealed, setRevealed] = useState(false)
    const [awaitingContinue, setAwaitingContinue] = useState(false)

    useEffect(() => {
        speak(word.word)
        // re-speak on every new word; cleanup not needed since speak() cancels prior utterance
    }, [word.id, word.word])

    const verdict = isCloseSpelling(input, word.word)

    const submit = () => {
        if (!input.trim() || submitted) return
        setSubmitted(true)
        if (verdict.ok) {
            playCorrect()
            setTimeout(() => onAnswer(true, verdict), 900)
        } else {
            playWrong()
            setAwaitingContinue(true)
        }
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
                    onKeyDown={e => e.key === 'Enter' && !awaitingContinue && submit()}
                    disabled={submitted}
                    placeholder="Type what you heard…"
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
                    <p className="text-center text-sm text-white/50">Correct: <span className="text-green-400 font-medium">{word.word}</span></p>
                )}
                {!submitted && (
                    <Button onClick={submit} className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={!input.trim()}>
                        Check
                    </Button>
                )}
                {awaitingContinue && (
                    <Button
                        onClick={() => onAnswer(false, verdict)}
                        className="w-full bg-white/10 hover:bg-white/15 text-white border border-white/20"
                    >
                        Continue →
                    </Button>
                )}
            </div>
        </div>
    )
}

// ── Fire overlay (portal — renders directly under document.body) ─────────────
// Using a portal bypasses framer-motion's opacity stacking context so the
// fixed overlay always sits at the correct viewport z-level.

function FireOverlay({ level, milestones }: { level: number; milestones: number }) {
    return (
        <>
            {/* Base fire glow from bottom — intensity grows with level */}
            <motion.div
                key="fire-base"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.0 }}
                className="fixed inset-0 pointer-events-none"
                style={{ zIndex: 2 }}
            >
                <div className="absolute inset-0" style={{
                    background: [
                        `radial-gradient(ellipse at 50% 110%, rgba(255,65,0,${Math.min(0.22 + level * 0.04, 0.38)}) 0%, rgba(255,130,0,${Math.min(0.12 + level * 0.02, 0.22)}) 32%, rgba(180,40,0,0.04) 58%, transparent 80%)`,
                        `radial-gradient(ellipse at 15% 100%, rgba(255,80,0,${Math.min(0.08 + level * 0.02, 0.16)}) 0%, transparent 38%)`,
                        `radial-gradient(ellipse at 85% 100%, rgba(255,80,0,${Math.min(0.08 + level * 0.02, 0.16)}) 0%, transparent 38%)`,
                    ].join(', ')
                }} />
            </motion.div>

            {/* Flicker layer — breathing animation mimics flame movement */}
            <motion.div
                className="fixed inset-0 pointer-events-none"
                animate={{ opacity: [0.45, 0.9, 0.55, 0.85, 0.45] }}
                transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
                style={{ zIndex: 2 }}
            >
                <div className="absolute inset-0" style={{
                    background: 'radial-gradient(ellipse at 50% 115%, rgba(255,45,0,0.13) 0%, transparent 52%)'
                }} />
            </motion.div>

            {/* Edge shimmer — second flicker slightly out of phase */}
            <motion.div
                className="fixed inset-0 pointer-events-none"
                animate={{ opacity: [0.3, 0.65, 0.3] }}
                transition={{ duration: 2.3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                style={{ zIndex: 2 }}
            >
                <div className="absolute inset-0" style={{
                    background: [
                        'radial-gradient(ellipse at 25% 105%, rgba(255,100,0,0.09) 0%, transparent 35%)',
                        'radial-gradient(ellipse at 75% 105%, rgba(255,100,0,0.09) 0%, transparent 35%)',
                    ].join(', ')
                }} />
            </motion.div>

            {/* Streak badge — re-keys on milestone so it pops on each new one */}
            <motion.div
                key={`badge-${milestones}`}
                initial={{ scale: 0.4, opacity: 0, y: -12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 22 }}
                className="fixed pointer-events-none flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{
                    top: '5.5rem',
                    right: '1rem',
                    zIndex: 60,
                    background: 'rgba(255, 80, 0, 0.18)',
                    border: '1px solid rgba(255, 155, 0, 0.55)',
                    color: 'rgb(255, 210, 100)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                }}
            >
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>🔥</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {milestones > 1 ? `${milestones}×` : 'On fire!'}
                </span>
            </motion.div>
        </>
    )
}

// ── Quiz/Spelling/Listening session wrapper (legacy correct-counter model) ──

function LegacySession({
    words, mode, onDone, drillStartIndex, drillTotal,
    initialPosition, onPositionChange,
}: {
    words: PracticeWord[]
    mode: Exclude<Mode, 'flashcard'>
    onDone: (correctIds: number[], missedIds: number[]) => void
    drillStartIndex: number
    drillTotal: number
    // Resume into the middle of a chunk. The values come from the server-
    // side snapshot (see PracticeProgress.chunk); only honoured on first
    // mount so subsequent in-session updates don't fight local state.
    initialPosition?: {
        index: number
        subMode?: 'quiz' | 'spelling'
        quizCorrectIds?: number[]
        spellCorrectIds?: number[]
        correctCount?: number
    }
    // Called after every answer with the current chunk position so the
    // parent can persist it. Fires synchronously inside advance(); the
    // parent debounces the actual network write.
    onPositionChange?: (pos: {
        index: number
        subMode: 'quiz' | 'spelling'
        quizCorrectIds: number[]
        spellCorrectIds: number[]
        correctCount: number
    }) => void
}) {
    // Quiz mode runs two passes over the same chunk: recognition first
    // (multiple choice), then recall (typed spelling). A word only counts
    // as "correct" if it passed BOTH passes — that's a stronger signal
    // than recognition alone and matches how the user wants results to
    // surface (10 MC items + 10 spelling items per chunk).
    const isQuizPlus = mode === 'quiz'
    const [subMode, setSubMode] = useState<'quiz' | 'spelling'>(
        initialPosition?.subMode ?? (mode === 'quiz' ? 'quiz' : (mode as 'quiz' | 'spelling'))
    )
    const [index, setIndex] = useState(initialPosition?.index ?? 0)

    // Pass-scoped trackers — used to gate progression to spell phase and
    // to compute the per-word "got it on both passes" finale.
    const [quizCorrect, setQuizCorrect] = useState<Set<number>>(
        () => new Set(initialPosition?.quizCorrectIds ?? []),
    )
    const [spellCorrect, setSpellCorrect] = useState<Set<number>>(
        () => new Set(initialPosition?.spellCorrectIds ?? []),
    )
    // Single combined display counter — increments on every right answer
    // in either pass so the user always sees forward momentum.
    const [correctCount, setCorrectCount] = useState(initialPosition?.correctCount ?? 0)

    // Fire streak — consecutive correct answers across the whole session.
    // Stored in a ref so advance() reads the latest value without needing
    // it in its dependency array, avoiding stale-closure issues.
    const streakRef = useRef(0)
    const [fireLevel, setFireLevel] = useState(0)      // 0 = no fire, 1+ = fire active
    const [fireMilestones, setFireMilestones] = useState(0) // how many 10-streak hits

    const { mutate: submitResult } = useSubmitResult()

    const word = words[index]
    // Total sub-questions in this chunk: 10 in normal modes, 20 in quiz+.
    const totalSubQuestions = words.length * (isQuizPlus ? 2 : 1)
    const subIndex = (isQuizPlus && subMode === 'spelling' ? words.length : 0) + index
    const progress = (subIndex / totalSubQuestions) * 100

    // Per-word status for the current pass — used by the status strip.
    // Keyed by word ID so advancing through the list is O(1).
    const [wordStatuses, setWordStatuses] = useState<Record<number, 'correct' | 'wrong'>>(() => {
        if (!initialPosition) return {}
        const m: Record<number, 'correct' | 'wrong'> = {}
        const correctIds = subMode === 'spelling'
            ? (initialPosition.spellCorrectIds ?? [])
            : (initialPosition.quizCorrectIds ?? [])
        // Mark answered-but-wrong words as wrong (any word before the current
        // index that isn't in the correct set was wrong in this pass).
        words.slice(0, initialPosition.index).forEach(w => {
            m[w.id] = correctIds.includes(w.id) ? 'correct' : 'wrong'
        })
        return m
    })

    // Drill-wide counter — in quiz+ mode each word generates two
    // sub-questions, so 31 words means 62 drill items. Scale both the
    // total and the running index so the user sees "Drill 17 / 62"
    // instead of a count that jumps backward when the spelling pass
    // restarts at the top of the chunk.
    const drillMultiplier = isQuizPlus ? 2 : 1
    const displayedDrillTotal = drillTotal * drillMultiplier
    const displayedDrillIndex = drillStartIndex * drillMultiplier + subIndex + 1

    const finish = useCallback((finalQuiz: Set<number>, finalSpell: Set<number>) => {
        // A word is "correct" only when both passes passed (or in non-
        // quiz-plus modes, when the single pass passed — finalSpell is
        // empty so the intersection collapses to finalQuiz which holds
        // single-pass results in those modes).
        const correctIds: number[] = []
        const missedIds: number[] = []
        for (const w of words) {
            const passedQuiz = finalQuiz.has(w.id)
            const passedSpell = isQuizPlus ? finalSpell.has(w.id) : true
            if (passedQuiz && passedSpell) correctIds.push(w.id)
            else missedIds.push(w.id)
        }
        onDone(correctIds, missedIds)
    }, [words, isQuizPlus, onDone])

    const advance = useCallback((
        wasCorrect: boolean,
        verdict?: { ok: boolean; exact: boolean },
    ) => {
        // Map the typed-answer verdict to the 3-level grade:
        //   exact         -> 2 (good)
        //   close (1-2ed) -> 1 (hard) — smaller interval bump + ease penalty
        //   wrong         -> 0 (lapse)
        // Quiz MCQ has no verdict, so it falls back to the binary
        // was_correct on the server (grade defaults to 0 or 2).
        const grade: PracticeGrade | undefined = verdict
            ? (verdict.ok ? (verdict.exact ? 2 : 1) : 0)
            : undefined
        submitResult({ wordId: word.id, wasCorrect, grade })
        const nextCorrectCount = correctCount + (wasCorrect ? 1 : 0)
        if (wasCorrect) setCorrectCount(nextCorrectCount)

        // Update the word-status strip immediately so the dot flips colour
        // in sync with the sound/colour feedback, before the next card slides in.
        setWordStatuses(prev => ({ ...prev, [word.id]: wasCorrect ? 'correct' : 'wrong' }))

        // Fire streak tracking — consecutive correct answers unlock the
        // fire background. A wrong answer extinguishes it and resets the
        // streak so the user has to earn it back.
        if (wasCorrect) {
            streakRef.current += 1
            if (streakRef.current % 10 === 0) {
                setFireLevel(lv => lv + 1)
                setFireMilestones(m => m + 1)
            }
        } else {
            streakRef.current = 0
            setFireLevel(0)
        }

        const nextQuiz = new Set(quizCorrect)
        const nextSpell = new Set(spellCorrect)
        if (wasCorrect) {
            if (subMode === 'spelling') nextSpell.add(word.id)
            else nextQuiz.add(word.id)
        }
        setQuizCorrect(nextQuiz)
        setSpellCorrect(nextSpell)

        const isLastInPass = index + 1 >= words.length
        let nextIndex = index
        let nextSubMode: 'quiz' | 'spelling' = subMode
        if (!isLastInPass) {
            nextIndex = index + 1
            setIndex(nextIndex)
        } else if (isQuizPlus && subMode === 'quiz') {
            // End of quiz pass → spelling pass on the same chunk.
            // Reset statuses for the spelling pass.
            setWordStatuses({})
            nextSubMode = 'spelling'
            nextIndex = 0
            setSubMode('spelling')
            setIndex(0)
        } else {
            // End of the whole chunk — fire finish() AND tell the parent so
            // it can either snapshot the final mid-chunk position (no-op
            // since the chunk is done) or fall through to the chunk-end
            // path. Position emit is intentionally fire-and-forget here.
            onPositionChange?.({
                index: words.length, // sentinel past the end
                subMode: nextSubMode,
                quizCorrectIds: Array.from(nextQuiz),
                spellCorrectIds: Array.from(nextSpell),
                correctCount: nextCorrectCount,
            })
            finish(nextQuiz, nextSpell)
            return
        }

        onPositionChange?.({
            index: nextIndex,
            subMode: nextSubMode,
            quizCorrectIds: Array.from(nextQuiz),
            spellCorrectIds: Array.from(nextSpell),
            correctCount: nextCorrectCount,
        })
    }, [
        word, index, words.length, subMode, isQuizPlus,
        quizCorrect, spellCorrect, correctCount,
        submitResult, finish, onPositionChange,
    ])

    return (
        <>
        {/* Fire overlay — portalled so it renders at document.body level,
            bypassing framer-motion's opacity stacking context. */}
        <AnimatePresence>
            {fireLevel > 0 && createPortal(
                <FireOverlay level={fireLevel} milestones={fireMilestones} />,
                document.body,
            )}
        </AnimatePresence>

        <div className="flex flex-col items-center gap-8">
            <div className="w-full max-w-md">
                <div className="flex justify-between text-[11px] sm:text-xs text-white/40 mb-1.5 gap-2">
                    <span className="truncate">
                        Question {subIndex + 1} / {totalSubQuestions}
                        {isQuizPlus && (
                            <span className="text-white/30">
                                {' '}· {subMode === 'quiz' ? 'Choose' : 'Type'}
                            </span>
                        )}
                        <span className="text-white/30"> · Drill {displayedDrillIndex} / {displayedDrillTotal}</span>
                    </span>
                    <span className="shrink-0">{correctCount} correct</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-blue-500 rounded-full"
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>

                {/* Word-status strip — one dot per word in this pass */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                    {words.map((w, i) => {
                        const status = wordStatuses[w.id]
                        const isCurrent = i === index
                        return (
                            <motion.div
                                key={w.id}
                                title={w.word}
                                initial={false}
                                animate={{
                                    scale: isCurrent ? 1.25 : 1,
                                    backgroundColor:
                                        isCurrent ? 'rgb(96 165 250)'   // blue-400
                                        : status === 'correct' ? 'rgb(74 222 128)'  // green-400
                                        : status === 'wrong'   ? 'rgb(248 113 113)' // red-400
                                        : 'rgba(255,255,255,0.12)',
                                }}
                                transition={{ duration: 0.2 }}
                                className="w-2 h-2 rounded-full cursor-default"
                            />
                        )
                    })}
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    // Re-key on subMode so the same word transitions cleanly
                    // when jumping from the quiz pass to the spelling pass.
                    key={`${subMode}-${word.id}`}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.2 }}
                    className="w-full flex flex-col items-center"
                >
                    {isQuizPlus && subMode === 'quiz' && <Quiz word={word} onAnswer={advance} />}
                    {isQuizPlus && subMode === 'spelling' && <Spelling word={word} onAnswer={advance} />}
                    {!isQuizPlus && mode === 'spelling' && <Spelling word={word} onAnswer={advance} />}
                    {!isQuizPlus && mode === 'listening' && <Listening word={word} onAnswer={advance} />}
                    {!isQuizPlus && mode === 'cloze' && <Cloze word={word} onAnswer={advance} />}
                </motion.div>
            </AnimatePresence>
        </div>
        </>
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

// ── Fireworks (celebratory particle burst over the Results screen) ──────────

/**
 * Lightweight, dependency-free particle burst rendered above the results
 * card. Three bursts originating from the top half of the viewport, each
 * spawning ~18 colored sparks that explode radially and fall under faux
 * gravity. The whole show lasts ~2.4s then unmounts — we don't want a
 * forever-running animation draining batteries on the Results screen.
 *
 * `intensity` scales burst count + particles so a perfect score reads as
 * bigger than a so-so finish.
 */
function Fireworks({ intensity = 1 }: { intensity?: number }) {
    const palette = [
        '#fbbf24', // amber-400
        '#34d399', // emerald-400
        '#60a5fa', // blue-400
        '#f472b6', // pink-400
        '#a78bfa', // violet-400
        '#f87171', // red-400
    ]
    const burstCount = Math.max(3, Math.round(3 * intensity))
    const particlesPerBurst = Math.max(14, Math.round(18 * intensity))
    // Pre-compute bursts so the random distribution is stable across the
    // animation's lifetime (no flicker from re-rolling each frame).
    const bursts = useMemo(() => (
        Array.from({ length: burstCount }, (_, b) => {
            const originX = 15 + Math.random() * 70   // 15% – 85% horizontally
            const originY = 18 + Math.random() * 25   // 18% – 43% vertically
            const delay = b * 0.18 + Math.random() * 0.12
            const particles = Array.from({ length: particlesPerBurst }, () => {
                const angle = Math.random() * Math.PI * 2
                const speed = 90 + Math.random() * 120
                return {
                    color: palette[Math.floor(Math.random() * palette.length)],
                    dx: Math.cos(angle) * speed,
                    dy: Math.sin(angle) * speed,
                    size: 4 + Math.random() * 4,
                }
            })
            return { originX, originY, delay, particles }
        })
        // Recompute only when intensity meaningfully changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [burstCount, particlesPerBurst])

    return (
        <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
            {bursts.map((burst, bi) => (
                <div
                    key={bi}
                    className="absolute"
                    style={{ left: `${burst.originX}%`, top: `${burst.originY}%` }}
                >
                    {burst.particles.map((p, pi) => (
                        <motion.span
                            key={pi}
                            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                            animate={{
                                x: p.dx,
                                // Add gravity — particles drift downward as they fly.
                                y: p.dy + 180,
                                opacity: 0,
                                scale: 0.4,
                            }}
                            transition={{
                                duration: 1.4 + Math.random() * 0.4,
                                delay: burst.delay,
                                ease: 'easeOut',
                            }}
                            className="absolute block rounded-full"
                            style={{
                                width: `${p.size}px`,
                                height: `${p.size}px`,
                                background: p.color,
                                boxShadow: `0 0 8px ${p.color}, 0 0 14px ${p.color}80`,
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    )
}

/**
 * Wrapper that mounts Fireworks for ~2.6s then unmounts so we aren't
 * keeping a fixed-position overlay alive on the Results screen after
 * the show is over (would block taps near top of screen otherwise,
 * even though it's pointer-events-none — defensive). For perfect
 * scores it relaunches a second wave for an extra beat.
 */
function CompletionFireworks({ pct }: { pct: number }) {
    const intensity = pct >= 80 ? 1.4 : pct >= 50 ? 1 : 0.7
    const [phase, setPhase] = useState<1 | 2 | 'done'>(1)

    useEffect(() => {
        // First wave runs ~2.4s.
        const t1 = setTimeout(() => {
            // Encore for high scores only — otherwise unmount.
            setPhase(pct >= 80 ? 2 : 'done')
        }, 2400)
        return () => clearTimeout(t1)
    }, [pct])

    useEffect(() => {
        if (phase !== 2) return
        const t = setTimeout(() => setPhase('done'), 2200)
        return () => clearTimeout(t)
    }, [phase])

    if (phase === 'done') return null
    // key forces a fresh Fireworks mount for the encore wave.
    return <Fireworks key={phase} intensity={intensity} />
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

// ── Word status list (pick-screen preview) ───────────────────────────────────

type WordStatus = 'new' | 'learning' | 'due' | 'mastered' | 'weak'

function wordStatus(w: PracticeWord): WordStatus {
    if ((w.lapses ?? 0) >= 2) return 'weak'
    const days = w.interval_days ?? 0
    if (days === 0) return 'new'
    const next = w.next_review_at ? new Date(w.next_review_at) : null
    if (next && next <= new Date()) return 'due'
    if (days >= 21) return 'mastered'
    return 'learning'
}

const STATUS_META: Record<WordStatus, { label: string; dot: string; text: string }> = {
    new:      { label: 'New',      dot: 'bg-blue-400',    text: 'text-blue-300'    },
    learning: { label: 'Learning', dot: 'bg-amber-400',   text: 'text-amber-300'   },
    due:      { label: 'Due',      dot: 'bg-green-400',   text: 'text-green-300'   },
    mastered: { label: 'Mastered', dot: 'bg-emerald-400', text: 'text-emerald-300' },
    weak:     { label: 'Weak',     dot: 'bg-red-400',     text: 'text-red-300'     },
}

function WordStatusList({ folderId, moduleId, dueOnly, weakOnly }: {
    folderId?: number
    moduleId?: number
    dueOnly: boolean
    weakOnly: boolean
}) {
    const { data: words = [], isLoading } = useWordPreview({
        moduleId,
        folderId: moduleId ? undefined : folderId,
        dueOnly,
        weakOnly,
    })

    // Tally status counts across the fetched sample for the summary row.
    const counts = useMemo(() => {
        const c: Record<WordStatus, number> = { new: 0, learning: 0, due: 0, mastered: 0, weak: 0 }
        for (const w of words) c[wordStatus(w)]++
        return c
    }, [words])

    if (isLoading) {
        return (
            <Card className="p-4 bg-white/2.5 border border-white/5">
                <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-6 w-20 bg-white/5 rounded-md animate-pulse" />
                    ))}
                </div>
            </Card>
        )
    }

    if (words.length === 0) return null

    return (
        <Card className="p-4 bg-white/2.5 border border-white/5">
            <div className="flex items-center justify-between mb-3 gap-2">
                <p className="text-sm text-white/60">Word sample</p>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                    {(Object.entries(counts) as [WordStatus, number][])
                        .filter(([, n]) => n > 0)
                        .map(([s, n]) => (
                            <span key={s} className={`flex items-center gap-1 text-[11px] ${STATUS_META[s].text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`} />
                                {n} {STATUS_META[s].label}
                            </span>
                        ))
                    }
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {words.map(w => {
                    const s = wordStatus(w)
                    const meta = STATUS_META[s]
                    return (
                        <motion.span
                            key={w.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            title={`${w.word} — ${meta.label}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors
                                ${s === 'due'      ? 'border-green-500/30 bg-green-500/8 text-green-200'    :
                                  s === 'weak'     ? 'border-red-500/30 bg-red-500/8 text-red-200'          :
                                  s === 'mastered' ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-200' :
                                  s === 'learning' ? 'border-amber-500/30 bg-amber-500/8 text-amber-200'    :
                                  'border-blue-500/30 bg-blue-500/8 text-blue-200'}`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                            <span className="font-medium truncate max-w-[8rem]">{w.word}</span>
                        </motion.span>
                    )
                })}
            </div>
        </Card>
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

// ── Resume card ──────────────────────────────────────────────────────────────

function ResumeCard({
    session, onResume, onDiscard, isResuming, isDiscarding, error,
}: {
    session: { id: number; mode: string; started_at: string; progress: PracticeProgress }
    onResume: () => void
    onDiscard: () => void
    isResuming: boolean
    isDiscarding: boolean
    error: string | null
}) {
    const progress = session.progress
    const remaining = progress.unseenIds.length + progress.mistakesIds.length
    const seen = progress.originalIds.length - progress.unseenIds.length
    const pct = progress.originalIds.length > 0
        ? Math.round((seen / progress.originalIds.length) * 100)
        : 0
    const modeLabel = MODE_META[session.mode as Mode]?.label ?? session.mode
    const startedAgo = (() => {
        const ms = Date.now() - new Date(session.started_at).getTime()
        const mins = Math.floor(ms / 60_000)
        if (mins < 1) return 'just now'
        if (mins < 60) return `${mins} min ago`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `${hours}h ago`
        const days = Math.floor(hours / 24)
        return `${days}d ago`
    })()

    return (
        <Card className="p-4 sm:p-5 bg-gradient-to-br from-indigo-500/10 to-blue-500/5 border border-indigo-400/30 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-indigo-300/80 font-medium mb-1">
                        Resume in-progress drill
                    </p>
                    <p className="text-white font-semibold truncate">{modeLabel}</p>
                    <p className="text-xs text-white/50 mt-0.5">
                        Started {startedAgo} · {progress.aggregate.correct}/{progress.aggregate.total} answered
                    </p>
                </div>
                <span className="shrink-0 text-xs px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 tabular-nums">
                    {pct}%
                </span>
            </div>

            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-indigo-400 to-blue-400 transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>

            <p className="text-xs text-white/40">
                {remaining} word{remaining === 1 ? '' : 's'} left in this drill.
            </p>

            {error && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-300">
                    {error}
                </div>
            )}

            <div className="flex gap-2">
                <Button
                    onClick={onResume}
                    disabled={isResuming || isDiscarding}
                    className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                    <Play className="w-4 h-4" />
                    {isResuming ? 'Loading…' : 'Resume'}
                </Button>
                <Button
                    onClick={onDiscard}
                    disabled={isResuming || isDiscarding}
                    variant="outline"
                    className="gap-2 border-white/15 text-white/60 hover:text-white hover:bg-white/5"
                >
                    <Trash2 className="w-4 h-4" />
                    {isDiscarding ? '…' : 'Discard'}
                </Button>
            </div>
        </Card>
    )
}


// ── Main page ────────────────────────────────────────────────────────────────

const MODE_META: Record<Mode, { label: string; desc: string; icon: React.FC<{ className?: string }> }> = {
    flashcard: { label: 'Flashcard', desc: 'Swipe right if you know, left to review', icon: BookOpen },
    quiz: { label: 'Multiple Choice + Spell', desc: 'Pick the word, then type it from memory', icon: Brain },
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
    const { data: activeSession, isLoading: isActiveLoading, refetch: refetchActive } = useActiveSession()
    const { mutate: updateProgress } = useUpdateSessionProgress()
    const { mutate: discardSession, isPending: isDiscarding } = useDiscardSession()
    const { refetch: fetchWordsByIds, isFetching: isResumeFetching } = usePracticeWordsByIds(
        // ids are filled at click-time via refetch; we just need a stable
        // hook reference here.
        useMemo(() => activeSession?.progress.originalIds ?? [], [activeSession]),
    )
    const [resumeError, setResumeError] = useState<string | null>(null)

    // Per-question in-chunk position. Lives on the parent so a tab-close
    // handler can include it in the beacon payload — the wrappers push it
    // here via onPositionChange after every answer.
    type ChunkPosition =
        | { kind: 'legacy'; index: number; subMode: 'quiz' | 'spelling'; quizCorrectIds: number[]; spellCorrectIds: number[]; correctCount: number }
        | { kind: 'flashcard'; index: number; knowIds: number[]; learningIds: number[] }
    const [chunkPosition, setChunkPosition] = useState<ChunkPosition | null>(null)
    // Ref (not state) so clearing it never triggers a re-render.
    // State-based clearing raced with AnimatePresence mode="wait": that
    // delays mounting the session child until the pick panel exits, by
    // which time the old [words] effect had already nulled the value and
    // LegacySession received initialPosition=undefined, starting at 0.
    const resumePositionRef = useRef<ChunkPosition | null>(null)

    const wordsById = useMemo(() => {
        const m = new Map<number, PracticeWord>()
        for (const w of originalWords) m.set(w.id, w)
        return m
    }, [originalWords])

    // Build a snapshot the resume flow can rehydrate from. Used by both the
    // per-answer auto-save and the tab-close beacon, so the two paths can't
    // drift. Reads chunkPosition out of the parameter (not from state) so
    // the caller can pass a freshly-computed position in the same tick the
    // wrapper handed it up.
    //
    // The current chunk is ALWAYS included when there's an in-flight one,
    // even if no answer has been recorded yet (chunkPosition === null) —
    // otherwise the saved unseenQueue/mistakesPool already exclude the
    // chunk's words and a resume would skip the chunk entirely. When the
    // user hasn't answered yet, we default index=0 and treat the chunk as
    // a "just started" snapshot.
    const buildSnapshot = useCallback((opts?: {
        position?: ChunkPosition | null
    }): PracticeProgress | null => {
        if (!sessionId) return null
        const pos = opts?.position !== undefined ? opts.position : chunkPosition
        const hasChunkInFlight = words.length > 0
        let chunk: PracticeProgress['chunk'] | undefined
        if (hasChunkInFlight) {
            const ids = words.map(w => w.id)
            if (pos?.kind === 'legacy') {
                chunk = {
                    ids,
                    index: pos.index,
                    subMode: pos.subMode,
                    quizCorrectIds: pos.quizCorrectIds,
                    spellCorrectIds: pos.spellCorrectIds,
                    correctCount: pos.correctCount,
                }
            } else if (pos?.kind === 'flashcard') {
                chunk = {
                    ids,
                    index: pos.index,
                    knowIds: pos.knowIds,
                    learningIds: pos.learningIds,
                }
            } else {
                // No answers yet in this chunk — record it at index 0 so
                // resume rebuilds the chunk as-is instead of skipping it.
                chunk = mode === 'flashcard'
                    ? { ids, index: 0, knowIds: [], learningIds: [] }
                    : {
                        ids,
                        index: 0,
                        subMode: mode === 'quiz' ? 'quiz' : 'spelling',
                        quizCorrectIds: [],
                        spellCorrectIds: [],
                        correctCount: 0,
                    }
            }
        }
        return {
            version: 1,
            mode,
            chunkSize,
            scope: {
                folderId: scopeFolderId ?? null,
                moduleId: scopeModuleId ?? null,
                dueOnly,
                weakOnly,
            },
            originalIds: originalWords.map(w => w.id),
            unseenIds: unseenQueue.map(w => w.id),
            mistakesIds: mistakesPool.map(w => w.id),
            aggregate: {
                correct: aggregate.correct,
                total: aggregate.total,
                missedIds: Array.from(aggregate.missedIds),
            },
            chunk,
        }
    }, [
        sessionId, chunkPosition, words, mode, chunkSize,
        scopeFolderId, scopeModuleId, dueOnly, weakOnly,
        originalWords, unseenQueue, mistakesPool, aggregate,
    ])

    // Keep the most recent snapshot in a ref so the tab-close beacon can
    // grab it without going through React's render cycle (handlers fire
    // during pagehide when state reads are too late).
    const snapshotRef = useRef<PracticeProgress | null>(null)

    // Per-question auto-save. Debounced so a rapid-fire answer streak
    // collapses into a single network write — at 200ms we get ~5 writes
    // per second worst case, which is well under what the backend cares
    // about and still feels "live" if you peek at the resume card after
    // a single answer.
    const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const scheduleSave = useCallback(() => {
        if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current)
        pendingSaveRef.current = setTimeout(() => {
            pendingSaveRef.current = null
            const snap = snapshotRef.current
            if (sessionId && snap) updateProgress({ sessionId, progress: snap })
        }, 250)
    }, [sessionId, updateProgress])

    // Whenever position OR session-level state moves, refresh the ref and
    // schedule a save. Only fires while the user is mid-session (phase ===
    // 'session') — chunk-review / pick / results never need per-question
    // writes, and the chunk-boundary save in handleChunkComplete still
    // handles the round-cleared snapshot.
    useEffect(() => {
        if (phase !== 'session' || !sessionId) return
        snapshotRef.current = buildSnapshot()
        scheduleSave()
    }, [phase, sessionId, chunkPosition, buildSnapshot, scheduleSave])

    // Flush the latest snapshot directly to the server, bypassing the
    // debounce. Used by the tab-close handler AND by the unmount cleanup
    // so SPA navigation (Back button, route change) doesn't drop the
    // in-flight 250ms save. Uses fetch({keepalive:true}) instead of
    // sendBeacon because the progress route is PUT and sendBeacon is
    // POST-only. keepalive lets the request finish after the page tears
    // down, within a ~64KB body budget that an ID-only snapshot fits.
    useEffect(() => {
        if (!sessionId) return
        const flush = () => {
            // Cancel any pending debounced save — we're about to send the
            // same data synchronously and don't want the timer to fire a
            // second write on an unmounted component.
            if (pendingSaveRef.current) {
                clearTimeout(pendingSaveRef.current)
                pendingSaveRef.current = null
            }
            const snap = snapshotRef.current
            if (!snap) return
            try {
                fetch(API_ENDPOINTS.PRACTICE.PROGRESS(sessionId), {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ progress: snap }),
                    keepalive: true,
                }).catch(() => { /* page is gone; nothing to handle */ })
            } catch {
                // Browsers reject keepalive fetches >64KB or in certain
                // detached contexts. Swallow — best-effort flush; the next
                // foreground tick will catch up.
            }
        }
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') flush()
        }
        window.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('pagehide', flush)
        return () => {
            window.removeEventListener('visibilitychange', onVisibility)
            window.removeEventListener('pagehide', flush)
            // SPA route change / Back button: neither pagehide nor
            // visibilitychange fires, so the debounced timer would be
            // dropped with the unmount. Flush synchronously here.
            flush()
        }
    }, [sessionId])

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
        // Fresh chunk always starts at index 0 — drop any leftover position
        // from a prior chunk or resume so the next snapshot reflects the
        // new chunk truthfully.
        setChunkPosition(null)
        resumePositionRef.current = null
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

    /**
     * Rehydrate a paused drill from its server-side snapshot and jump
     * straight into the next chunk. Word IDs are persisted (not full
     * objects) so any edits to those words since the pause are
     * reflected — we always read fresh data here.
     *
     * If words have been deleted between sessions the rehydrated pool
     * shrinks silently rather than failing — the user still gets to
     * finish whatever's left.
     */
    const resume = useCallback(async () => {
        if (!activeSession) return
        const snap = activeSession.progress
        primeAudio()
        setResumeError(null)
        const res = await fetchWordsByIds()
        if (res.error) {
            setResumeError((res.error as Error).message || 'Could not load saved drill')
            return
        }
        const fetched = res.data ?? []
        if (fetched.length < 2) {
            setResumeError('The saved drill no longer has enough words. Start a new one.')
            return
        }
        const byId = new Map<number, PracticeWord>(fetched.map(w => [w.id, w]))

        // Rebuild ordered arrays from the snapshot's ID lists. Drop
        // any IDs that have been deleted or moved out of the user's
        // scope since the pause.
        const ordered = snap.originalIds.map(id => byId.get(id)).filter((w): w is PracticeWord => Boolean(w))
        const unseen = snap.unseenIds.map(id => byId.get(id)).filter((w): w is PracticeWord => Boolean(w))
        const mistakes = snap.mistakesIds.map(id => byId.get(id)).filter((w): w is PracticeWord => Boolean(w))

        if (snap.mode === 'cloze') {
            // Cloze rejects words without a usable sentence — same guard
            // as `start()`. Apply it to all three lists; the aggregate
            // counters stay as-is since they reflect history, not
            // remaining work.
            const keep = (w: PracticeWord) => buildCloze(w) !== null
            const orderedFiltered = ordered.filter(keep)
            if (orderedFiltered.length < 2) {
                setResumeError('Cloze needs example sentences. Edit your saved words or start a new drill.')
                return
            }
        }

        setMode(snap.mode as Mode)
        setScopeFolderId(snap.scope.folderId ?? undefined)
        setScopeModuleId(snap.scope.moduleId ?? undefined)
        setDueOnly(snap.scope.dueOnly)
        setWeakOnly(snap.scope.weakOnly)
        setOriginalWords(ordered)
        setSessionId(activeSession.id)
        setResults(null)
        setLastChunk(null)
        setAggregate({
            correct: snap.aggregate.correct,
            total: snap.aggregate.total,
            missedIds: new Set<number>(snap.aggregate.missedIds),
        })

        // Prefer the mid-chunk snapshot when present — the user was on a
        // specific question and we want them to land exactly there. Falls
        // back to the chunk-boundary behaviour when the saved snapshot
        // pre-dates per-question saves (no `chunk` field).
        if (snap.chunk && snap.chunk.ids.length > 0) {
            const chunkWords = snap.chunk.ids
                .map(id => byId.get(id))
                .filter((w): w is PracticeWord => Boolean(w))
            if (chunkWords.length >= 1 && snap.chunk.index < chunkWords.length) {
                setUnseenQueue(unseen)
                setMistakesPool(mistakes)
                setWords(chunkWords)
                // Seed chunkPosition (so the next auto-save reflects the
                // user's actual offset, not a default index=0) and the
                // resumePositionRef (so the wrapper's lazy initial state
                // picks it up on mount without a state-race against
                // AnimatePresence). chunkPosition sticks until the user
                // answers and emits a new one; the ref is cleared by
                // startChunk() when the next fresh chunk begins.
                const seeded: ChunkPosition = snap.mode === 'flashcard'
                    ? {
                        kind: 'flashcard',
                        index: snap.chunk.index,
                        knowIds: snap.chunk.knowIds ?? [],
                        learningIds: snap.chunk.learningIds ?? [],
                    }
                    : {
                        kind: 'legacy',
                        index: snap.chunk.index,
                        subMode: snap.chunk.subMode ?? (snap.mode === 'quiz' ? 'quiz' : 'spelling'),
                        quizCorrectIds: snap.chunk.quizCorrectIds ?? [],
                        spellCorrectIds: snap.chunk.spellCorrectIds ?? [],
                        correctCount: snap.chunk.correctCount ?? 0,
                    }
                resumePositionRef.current = seeded
                setChunkPosition(seeded)
                setPhase('session')
                return
            }
            // Snapshot pointed at a chunk that no longer reconstructs
            // cleanly (words deleted, index out of range). Fall through
            // to the chunk-boundary path instead of erroring out.
        }

        // Pull the next chunk from (mistakes-pool, unseen) — same
        // ordering as `continueChunk` so the resumed session feels
        // identical to clicking Continue after a chunk-review.
        const { chunk, unseenRest, poolRest } = takeChunk(unseen, mistakes, chunkSize)
        setUnseenQueue(unseenRest)
        setMistakesPool(poolRest)
        // Inline startChunk's body without the createSession branch —
        // we're reusing the existing session row, and startChunk's
        // closure would still see the pre-setSessionId `null` and
        // spawn a duplicate.
        setWords(chunk)
        setPhase('session')
    }, [activeSession, fetchWordsByIds, takeChunk])

    /** Throw away the active session so the next Start begins fresh. */
    const discardActive = useCallback(() => {
        if (!activeSession) return
        discardSession(activeSession.id, {
            onSuccess: () => { refetchActive() },
        })
    }, [activeSession, discardSession, refetchActive])

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
        // Fanfare for clearing the full drill — distinct from the per-round
        // checkpoint chime so the user can tell "round done" apart from
        // "drill complete" by ear.
        playComplete()
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

        const drillFinished = unseenQueue.length === 0 && nextPool.length === 0

        // Snapshot the drill at this chunk boundary so a navigation away
        // can be resumed. On drill completion the row gets marked
        // completed_at by finishRun → completeSession, which clears the
        // progress server-side; no need to null it here.
        if (sessionId && !drillFinished) {
            const snapshot: PracticeProgress = {
                version: 1,
                mode,
                chunkSize,
                scope: {
                    folderId: scopeFolderId ?? null,
                    moduleId: scopeModuleId ?? null,
                    dueOnly,
                    weakOnly,
                },
                originalIds: originalWords.map(w => w.id),
                unseenIds: unseenQueue.map(w => w.id),
                mistakesIds: nextPool.map(w => w.id),
                aggregate: {
                    correct: nextAggregate.correct,
                    total: nextAggregate.total,
                    missedIds: Array.from(nextAggregate.missedIds),
                },
            }
            updateProgress({ sessionId, progress: snapshot })
        }

        if (drillFinished) {
            finishRun(nextAggregate)
            return
        }
        // Round cleared but the drill keeps going — short ladder chime to
        // mark the checkpoint before the review screen renders.
        playCheckpoint()
        setPhase('chunk-review')
    }, [
        aggregate, mistakesPool, unseenQueue, wordsById, finishRun,
        sessionId, mode, chunkSize, scopeFolderId, scopeModuleId,
        dueOnly, weakOnly, originalWords, updateProgress,
    ])

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
                            {activeSession && !isActiveLoading && (
                                <ResumeCard
                                    session={activeSession}
                                    onResume={resume}
                                    onDiscard={discardActive}
                                    isResuming={isResumeFetching}
                                    isDiscarding={isDiscarding}
                                    error={resumeError}
                                />
                            )}
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
                                        title="Cards you keep forgetting — 2+ lapses or low ease"
                                        className={`px-3 py-1.5 rounded-lg text-xs border transition-all flex items-center gap-1.5 ${
                                            weakOnly
                                                ? 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                                                : 'border-white/10 text-white/50 hover:bg-white/5'
                                        }`}
                                    ><AlertCircle className="w-3 h-3" /> Fragile words</button>
                                </div>
                                <p className="text-xs text-white/30 mt-2">
                                    {dueOnly && 'Only words whose review interval has elapsed (or never reviewed).'}
                                    {weakOnly && 'Words you keep struggling with — 2+ lapses or low ease. Brand-new words are in Learning, not here.'}
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

                            {/* Random word-status preview */}
                            <WordStatusList
                                folderId={scopeFolderId}
                                moduleId={scopeModuleId}
                                dueOnly={dueOnly}
                                weakOnly={weakOnly}
                            />

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
                                        autoTts
                                        initialPosition={
                                            resumePositionRef.current?.kind === 'flashcard'
                                                ? {
                                                    index: resumePositionRef.current.index,
                                                    knowIds: resumePositionRef.current.knowIds,
                                                    learningIds: resumePositionRef.current.learningIds,
                                                }
                                                : undefined
                                        }
                                        onPositionChange={(pos) => setChunkPosition({
                                            kind: 'flashcard',
                                            index: pos.index,
                                            knowIds: pos.knowIds,
                                            learningIds: pos.learningIds,
                                        })}
                                    />
                                ) : (
                                    <LegacySession
                                        key={`ls-${words.map(w => w.id).join('-')}`}
                                        words={words}
                                        mode={mode}
                                        onDone={handleLegacyDone}
                                        drillStartIndex={drillStartIndex}
                                        drillTotal={drillTotal}
                                        initialPosition={
                                            resumePositionRef.current?.kind === 'legacy'
                                                ? {
                                                    index: resumePositionRef.current.index,
                                                    subMode: resumePositionRef.current.subMode,
                                                    quizCorrectIds: resumePositionRef.current.quizCorrectIds,
                                                    spellCorrectIds: resumePositionRef.current.spellCorrectIds,
                                                    correctCount: resumePositionRef.current.correctCount,
                                                }
                                                : undefined
                                        }
                                        onPositionChange={(pos) => setChunkPosition({
                                            kind: 'legacy',
                                            index: pos.index,
                                            subMode: pos.subMode,
                                            quizCorrectIds: pos.quizCorrectIds,
                                            spellCorrectIds: pos.spellCorrectIds,
                                            correctCount: pos.correctCount,
                                        })}
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
                            {/* Fireworks burst on completion — scales with
                                score so a perfect drill feels meaningfully
                                bigger than a 50% one. The pct is clamped at
                                the floor so even low scores get a small
                                celebration for finishing. */}
                            <CompletionFireworks
                                pct={results.total > 0
                                    ? Math.round((results.correct / results.total) * 100)
                                    : 0}
                            />
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
