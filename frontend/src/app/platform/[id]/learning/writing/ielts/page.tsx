'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft, BookOpen, Target, TrendingUp, TrendingDown, Minus,
    Clock, CheckCircle2, XCircle, ChevronRight, RefreshCw, Lightbulb,
    AlertTriangle, Award, Pencil, BarChart2, Zap, GraduationCap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    useTask2Start,
    useTask2Grade,
    useTask2Analytics,
    useTask2History,
    useGrammarDrillQueue,
    type Task2Session,
    type Task2GradeResult,
    type Task2Analytics,
    type Task2HistoryItem,
    type GrammarErrorItem,
    type GrammarDrillItem,
} from '@/lib/hooks/use-task2'

// ─── Helpers ─────────────────────────────────────────────────────────────────

type EssayType = 'essay_intro' | 'essay_paragraph' | 'essay_full'

const TYPE_LABELS: Record<EssayType, string> = {
    essay_intro:     'Introduction',
    essay_paragraph: 'Body Paragraph',
    essay_full:      'Full Essay',
}

const TYPE_DESC: Record<EssayType, string> = {
    essay_intro:     'Paraphrase the question + write a clear thesis (40–60 words)',
    essay_paragraph: 'Topic sentence → Explanation → Example → Link (80–120 words)',
    essay_full:      'Complete Task 2 essay: intro + 2 body paragraphs + conclusion (250+ words)',
}

const ESSAY_ERROR_LABELS: Record<string, string> = {
    no_clear_position:        'No clear position',
    doesnt_address_all_parts: "Doesn't address all parts",
    underdeveloped_idea:      'Underdeveloped idea',
    missing_topic_sentence:   'Missing topic sentence',
    weak_cohesion:            'Weak cohesion',
    paragraphing_issue:       'Paragraphing issue',
    no_referencing:           'Over-repeats nouns',
    overgeneralization:       'Overgeneralization',
    repetitive_vocabulary:    'Repetitive vocabulary',
    informal_register:        'Informal register',
    template_overuse:         'Template / memorized filler',
    weak_conclusion:          'Weak conclusion',
    irrelevant_content:       'Irrelevant content',
    off_topic:                'Off topic',
}

function labelError(key: string) {
    return ESSAY_ERROR_LABELS[key] ?? key.replace(/_/g, ' ')
}

const BAND_COLOR = (b: number) =>
    b >= 7   ? 'text-emerald-400' :
    b >= 6   ? 'text-amber-400'   :
    b >= 5   ? 'text-orange-400'  :
               'text-rose-400'

const BAND_BG = (b: number) =>
    b >= 7   ? 'bg-emerald-500/10 border-emerald-500/25' :
    b >= 6   ? 'bg-amber-500/10 border-amber-500/25'     :
    b >= 5   ? 'bg-orange-500/10 border-orange-500/25'   :
               'bg-rose-500/10 border-rose-500/25'

const TREND_ICON = (t: string) =>
    t === 'rising'  ? <TrendingUp  className="w-3.5 h-3.5 text-emerald-400" /> :
    t === 'falling' ? <TrendingDown className="w-3.5 h-3.5 text-rose-400" />   :
                      <Minus className="w-3.5 h-3.5 text-white/30" />

const GRAMMAR_POINT_LABELS: Record<string, string> = {
    articles:                 'Articles (a / an / the)',
    subject_verb_agreement:   'Subject-verb agreement',
    present_perfect:          'Present perfect vs past simple',
    tense_consistency:        'Tense consistency',
    prepositions:             'Dependent prepositions',
    countable_uncountable:    'Countable vs uncountable',
    complex_sentences:        'Complex sentences',
    relative_clauses:         'Relative clauses',
    conditionals:             'Conditionals',
    passive_voice:            'Passive voice',
    word_order:               'Word order',
    gerund_infinitive:        'Gerund vs infinitive',
    modal_verbs:              'Modal verbs',
    comparatives_superlatives:'Comparatives & superlatives',
    plural_singular:          'Plural / singular forms',
    punctuation_run_on:       'Run-on sentences',
    other:                    'Other grammar',
}

const CRITERIA_LABELS: Record<string, string> = {
    task_response:              'Task Response',
    coherence_cohesion:         'Coherence & Cohesion',
    lexical_resource:           'Lexical Resource',
    grammatical_range_accuracy: 'Grammar Range & Accuracy',
}

function fmtSeconds(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
}

type Phase = 'idle' | 'writing' | 'grading' | 'result'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IELTSPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [phase, setPhase]     = useState<Phase>('idle')
    const [session, setSession] = useState<Task2Session | null>(null)
    const [result, setResult]   = useState<Task2GradeResult | null>(null)
    const [draft, setDraft]     = useState('')
    const [elapsed, setElapsed] = useState(0)
    const [targetBand, setTargetBand] = useState(7.0)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const { mutate: startSession, isPending: starting } = useTask2Start(params.id)
    const { mutate: gradeResponse, isPending: grading } = useTask2Grade(params.id)
    const { data: analytics, refetch: refetchAnalytics }  = useTask2Analytics(params.id)
    const { data: history, refetch: refetchHistory }       = useTask2History(params.id, 1, 10)
    const { data: grammarQueue, refetch: refetchGrammarQueue } = useGrammarDrillQueue(params.id, 5)

    useEffect(() => {
        if (phase === 'writing' && session?.essay_type === 'essay_full') {
            timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
        } else {
            if (timerRef.current) clearInterval(timerRef.current)
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }, [phase, session?.essay_type])

    const handleStart = useCallback(() => {
        startSession(
            { target_band: targetBand },
            {
                onSuccess: (data) => {
                    setSession(data)
                    setDraft('')
                    setElapsed(0)
                    setPhase('writing')
                },
            },
        )
    }, [startSession, targetBand])

    const handleSubmit = useCallback(() => {
        if (!session || draft.trim().length < 5) return
        setPhase('grading')
        gradeResponse(
            {
                session_id: session.session_id,
                response: draft,
                time_seconds: session.essay_type === 'essay_full' ? elapsed : undefined,
            },
            {
                onSuccess: (data) => {
                    setResult(data)
                    setPhase('result')
                    refetchAnalytics()
                    refetchHistory()
                    refetchGrammarQueue()
                },
                onError: () => setPhase('writing'),
            },
        )
    }, [session, draft, elapsed, gradeResponse, refetchAnalytics, refetchHistory])

    const handleNext = useCallback(() => {
        setSession(null)
        setResult(null)
        setDraft('')
        setElapsed(0)
        setPhase('idle')
    }, [])

    const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0

    return (
        <div className="min-h-screen p-4 sm:p-8">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                    <button
                        onClick={() => router.push(`/platform/${params.id}/learning/writing`)}
                        className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-white/50" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-white">IELTS Task 2</h1>
                        <p className="text-xs text-white/40">Scaffolded essay practice with band scoring</p>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {phase === 'idle' && (
                        <IdlePhase
                            key="idle"
                            analytics={analytics ?? undefined}
                            history={history?.items ?? undefined}
                            grammarQueue={grammarQueue?.drill_queue ?? undefined}
                            targetBand={targetBand}
                            onTargetBandChange={setTargetBand}
                            onStart={handleStart}
                            starting={starting}
                        />
                    )}
                    {phase === 'writing' && session && (
                        <WritingPhase
                            key="writing"
                            session={session}
                            draft={draft}
                            onDraftChange={setDraft}
                            wordCount={wordCount}
                            elapsed={elapsed}
                            onSubmit={handleSubmit}
                        />
                    )}
                    {phase === 'grading' && (
                        <GradingPhase key="grading" />
                    )}
                    {phase === 'result' && result && session && (
                        <ResultPhase
                            key="result"
                            result={result}
                            session={session}
                            draft={draft}
                            onNext={handleNext}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}

// ─── Idle ─────────────────────────────────────────────────────────────────────

function IdlePhase({
    analytics, history, grammarQueue, targetBand, onTargetBandChange, onStart, starting,
}: {
    analytics: Task2Analytics | undefined
    history: Task2HistoryItem[] | undefined
    grammarQueue: GrammarDrillItem[] | undefined
    targetBand: number
    onTargetBandChange: (v: number) => void
    onStart: () => void
    starting: boolean
}) {
    const BANDS = [5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0]

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
        >
            {/* Recurring issues */}
            {analytics && analytics.essay_focus.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span className="text-sm font-medium text-amber-300">Your recurring issues</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {analytics.essay_focus.map((e) => (
                            <span key={e} className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/20">
                                {labelError(e)}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Grammar drill queue */}
            {grammarQueue && grammarQueue.length > 0 && (
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <GraduationCap className="w-4 h-4 text-violet-400" />
                        <span className="text-sm font-medium text-violet-300">Grammar to drill</span>
                        <span className="ml-auto text-xs text-violet-400/50">from your essays</span>
                    </div>
                    <div className="space-y-2">
                        {grammarQueue.map(item => (
                            <div key={item.grammar_point_id} className="flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-white/70 truncate">
                                        {GRAMMAR_POINT_LABELS[item.grammar_point_id] ?? item.grammar_point_id.replace(/_/g, ' ')}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-violet-500/70 transition-all"
                                                style={{ width: `${Math.round(item.mastery * 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] text-white/30 shrink-0 tabular-nums">
                                            {Math.round(item.mastery * 100)}%
                                        </span>
                                    </div>
                                </div>
                                {item.lapses > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/20 shrink-0">
                                        {item.lapses}×
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Target band selector */}
            <div className="rounded-xl border border-white/8 bg-white/3 p-5">
                <p className="text-sm text-white/60 mb-3">Target band</p>
                <div className="flex flex-wrap gap-2">
                    {BANDS.map(b => (
                        <button
                            key={b}
                            onClick={() => onTargetBandChange(b)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                targetBand === b
                                    ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-500/40'
                                    : 'bg-white/5 text-white/50 border border-white/8 hover:bg-white/10'
                            }`}
                        >
                            {b}
                        </button>
                    ))}
                </div>
            </div>

            {/* Start */}
            <div className="rounded-xl border border-white/8 bg-white/3 p-5">
                <p className="text-sm text-white/60 mb-4">Adaptive — picks type based on your weaknesses</p>
                <Button
                    onClick={onStart}
                    disabled={starting}
                    className="w-full bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-500/30"
                >
                    {starting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
                    Next Exercise
                </Button>
            </div>

            {/* Analytics */}
            {analytics && analytics.total_attempts > 0 && (
                <div className="rounded-xl border border-white/8 bg-white/3 p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart2 className="w-4 h-4 text-white/40" />
                        <p className="text-sm text-white/60">Your progress</p>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="rounded-lg bg-white/3 border border-white/8 p-3 text-center">
                            <p className="text-lg font-bold text-white">{analytics.total_attempts}</p>
                            <p className="text-xs text-white/40">Total</p>
                        </div>
                        <div className="rounded-lg bg-white/3 border border-white/8 p-3 text-center">
                            <p className={`text-lg font-bold ${analytics.avg_band_30 ? BAND_COLOR(analytics.avg_band_30) : 'text-white/30'}`}>
                                {analytics.avg_band_30 ?? '—'}
                            </p>
                            <p className="text-xs text-white/40">Avg band</p>
                        </div>
                        <div className="rounded-lg bg-white/3 border border-white/8 p-3 text-center">
                            <p className="text-lg font-bold text-white">{analytics.recent_30}</p>
                            <p className="text-xs text-white/40">Last 30</p>
                        </div>
                    </div>

                    <p className="text-xs text-white/40 mb-2">Band trends (last 5)</p>
                    <div className="grid grid-cols-2 gap-2">
                        {Object.entries(CRITERIA_LABELS).map(([key, label]) => (
                            <div key={key} className="flex items-center gap-2">
                                {TREND_ICON(analytics.band_trends[key] ?? 'flat')}
                                <span className="text-xs text-white/50">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent history */}
            {history && history.length > 0 && (
                <div className="rounded-xl border border-white/8 bg-white/3 p-5">
                    <p className="text-sm text-white/60 mb-3">Recent</p>
                    <div className="space-y-2">
                        {history.slice(0, 5).map(h => (
                            <div key={h.id} className="flex items-center gap-3">
                                {h.is_correct
                                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                    : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                                }
                                <span className="text-xs text-white/50 flex-1 truncate">{h.question}</span>
                                <span className={`text-xs font-semibold shrink-0 ${h.overall_band !== null ? BAND_COLOR(h.overall_band!) : 'text-white/30'}`}>
                                    {h.overall_band ?? '—'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    )
}

// ─── Writing ─────────────────────────────────────────────────────────────────

function WritingPhase({
    session, draft, onDraftChange, wordCount, elapsed, onSubmit,
}: {
    session: Task2Session
    draft: string
    onDraftChange: (v: string) => void
    wordCount: number
    elapsed: number
    onSubmit: () => void
}) {
    const limits = session.word_limits
    const withinRange = wordCount >= limits.min && (limits.max === null || wordCount <= limits.max)
    const tooShort = wordCount < limits.min
    const isFull = session.essay_type === 'essay_full'
    const limitLabel = limits.max !== null ? `${limits.min}–${limits.max}` : `${limits.min}+`

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
        >
            {/* Type badge + timer */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
                        {TYPE_LABELS[session.essay_type as EssayType]}
                    </span>
                    <span className="text-xs text-white/30">{session.question_type.replace(/_/g, ' ')}</span>
                </div>
                {isFull && (
                    <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <Clock className="w-3.5 h-3.5" />
                        {fmtSeconds(elapsed)}
                    </div>
                )}
            </div>

            {/* Question */}
            <div className="rounded-xl border border-white/10 bg-white/3 p-5">
                <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">Question</p>
                <p className="text-white/90 leading-relaxed">{session.question}</p>
                {session.assigned_position && (
                    <div className="mt-3 pt-3 border-t border-white/8">
                        <p className="text-xs text-indigo-400/70 mb-1">Assigned position</p>
                        <p className="text-sm text-indigo-200">{session.assigned_position}</p>
                    </div>
                )}
            </div>

            {/* Focus banner */}
            {session.essay_focus.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-500/15 bg-amber-500/5">
                    <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-xs text-amber-300 font-medium mb-0.5">Focus on avoiding</p>
                        <p className="text-xs text-amber-200/70">
                            {session.essay_focus.map(e => labelError(e)).join(' · ')}
                        </p>
                    </div>
                </div>
            )}

            {/* Drill instruction */}
            {session.drill_instruction && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-sky-500/15 bg-sky-500/5">
                    <Target className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-sky-200/80">{session.drill_instruction}</p>
                </div>
            )}

            {/* Type hint */}
            <p className="text-xs text-white/30">{TYPE_DESC[session.essay_type as EssayType]}</p>

            {/* Textarea */}
            <textarea
                value={draft}
                onChange={e => onDraftChange(e.target.value)}
                placeholder="Start writing here…"
                rows={isFull ? 16 : 8}
                className="w-full bg-white/3 border border-white/10 rounded-xl p-4 text-white placeholder:text-white/20 resize-none outline-none focus:border-indigo-500/40 text-sm leading-relaxed transition-colors"
            />

            {/* Word count + submit */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold tabular-nums ${
                        withinRange ? 'text-emerald-400' : tooShort ? 'text-white/40' : 'text-amber-400'
                    }`}>
                        {wordCount}
                    </span>
                    <span className="text-xs text-white/30">/ {limitLabel} words</span>
                </div>
                <Button
                    onClick={onSubmit}
                    disabled={wordCount < 5}
                    className="bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-500/30"
                >
                    Submit
                </Button>
            </div>
        </motion.div>
    )
}

// ─── Grammar Errors Block ────────────────────────────────────────────────────

function GrammarErrorsBlock({ errors }: { errors: GrammarErrorItem[] }) {
    const [open, setOpen] = useState(false)

    const majorCount = errors.filter(e => e.severity === 'major').length
    const minorCount = errors.length - majorCount

    return (
        <div className="rounded-xl border border-orange-500/15 bg-orange-500/5 p-4">
            <button
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 w-full"
            >
                <Zap className="w-4 h-4 text-orange-400 shrink-0" />
                <span className="text-sm font-medium text-orange-300 flex-1 text-left">
                    Grammar errors ({errors.length})
                </span>
                <div className="flex items-center gap-1.5 mr-2">
                    {majorCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/20">
                            {majorCount} major
                        </span>
                    )}
                    {minorCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            {minorCount} minor
                        </span>
                    )}
                </div>
                <ChevronRight className={`w-4 h-4 text-white/30 transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>

            {open && (
                <div className="mt-3 pt-3 border-t border-white/8 space-y-3">
                    {errors.map((e, i) => (
                        <div key={i} className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                    e.severity === 'major'
                                        ? 'bg-rose-500/15 text-rose-400 border-rose-500/20'
                                        : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                                }`}>
                                    {e.severity}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20">
                                    {GRAMMAR_POINT_LABELS[e.category] ?? e.category.replace(/_/g, ' ')}
                                </span>
                            </div>
                            <div className="text-xs text-white/70">
                                <span className="line-through text-rose-400/80">{e.span}</span>
                                <span className="text-white/30 mx-1.5">→</span>
                                <span className="text-emerald-400/90">{e.correction}</span>
                            </div>
                            <p className="text-[11px] text-white/40 leading-relaxed">{e.rule}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ─── Grading ─────────────────────────────────────────────────────────────────

function GradingPhase() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-24 gap-4"
        >
            <div className="w-10 h-10 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
            <p className="text-sm text-white/40">Grading your response…</p>
        </motion.div>
    )
}

// ─── Result ───────────────────────────────────────────────────────────────────

function ResultPhase({
    result, session, draft, onNext,
}: {
    result: Task2GradeResult
    session: Task2Session
    draft: string
    onNext: () => void
}) {
    const [showRevision, setShowRevision] = useState(false)
    const [showDraft, setShowDraft]       = useState(false)

    const criteriaKeys = ['task_response', 'coherence_cohesion', 'lexical_resource', 'grammatical_range_accuracy'] as const
    const overallBand = result.overall_band ?? 0

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
        >
            {/* Overall band hero */}
            <div className={`rounded-2xl border p-6 text-center ${BAND_BG(overallBand)}`}>
                <div className="flex items-center justify-center gap-2 mb-1">
                    {result.is_correct
                        ? <Award className="w-5 h-5 text-emerald-400" />
                        : <Target className="w-5 h-5 text-white/40" />
                    }
                    <span className="text-xs text-white/50 uppercase tracking-wider">Overall Band</span>
                </div>
                <p className={`text-5xl font-bold tabular-nums mb-2 ${BAND_COLOR(overallBand)}`}>
                    {result.overall_band ?? '—'}
                </p>
                <p className="text-xs text-white/40">
                    Target: {session.target_band} · {result.word_count} words
                </p>
            </div>

            {/* Per-criterion bands */}
            <div className="grid grid-cols-2 gap-3">
                {criteriaKeys.map(key => {
                    const val = result.criteria_scores?.[key]
                    return (
                        <div key={key} className="rounded-xl border border-white/8 bg-white/3 p-3">
                            <p className="text-xs text-white/40 mb-1">{CRITERIA_LABELS[key]}</p>
                            <p className={`text-xl font-bold tabular-nums ${val != null ? BAND_COLOR(val) : 'text-white/30'}`}>
                                {val ?? '—'}
                            </p>
                        </div>
                    )
                })}
            </div>

            {/* Feedback */}
            {result.feedback && (
                <div className="rounded-xl border border-white/8 bg-white/3 p-4">
                    <p className="text-xs text-white/40 mb-2">Feedback</p>
                    <p className="text-sm text-white/80 leading-relaxed">{result.feedback}</p>
                </div>
            )}

            {/* Essay errors */}
            {result.essay_errors && result.essay_errors.length > 0 && (
                <div className="rounded-xl border border-rose-500/15 bg-rose-500/5 p-4">
                    <p className="text-xs text-rose-400/70 mb-2">Issues in this response</p>
                    <div className="flex flex-wrap gap-1.5">
                        {result.essay_errors.map(e => (
                            <span key={e} className="text-xs px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/20">
                                {labelError(e)}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Grammar errors — sentence-level from the new SRS grader */}
            {result.grammar_errors && result.grammar_errors.length > 0 && (
                <GrammarErrorsBlock errors={result.grammar_errors} />
            )}

            {/* Focus audit: were prior issues fixed? */}
            {session.essay_focus.length > 0 && (
                <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 p-4">
                    <p className="text-xs text-indigo-400/70 mb-2">Focus check</p>
                    <div className="flex flex-wrap gap-1.5">
                        {session.essay_focus.map(e => {
                            const hasError = (result.essay_errors ?? []).includes(e)
                            return (
                                <span
                                    key={e}
                                    className={`text-xs px-2 py-0.5 rounded-full border ${
                                        hasError
                                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/20'
                                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20'
                                    }`}
                                >
                                    {hasError ? '✗' : '✓'} {labelError(e)}
                                </span>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Model revision */}
            {result.model_revision && (
                <div className="rounded-xl border border-white/8 bg-white/3 p-4">
                    <button
                        onClick={() => setShowRevision(v => !v)}
                        className="flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition-colors w-full"
                    >
                        <BookOpen className="w-4 h-4" />
                        Band 8 opening sentence
                        <ChevronRight className={`w-4 h-4 ml-auto transition-transform ${showRevision ? 'rotate-90' : ''}`} />
                    </button>
                    {showRevision && (
                        <p className="mt-3 pt-3 border-t border-white/8 text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                            {result.model_revision}
                        </p>
                    )}
                </div>
            )}

            {/* Your response */}
            <div className="rounded-xl border border-white/8 bg-white/3 p-4">
                <button
                    onClick={() => setShowDraft(v => !v)}
                    className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors w-full"
                >
                    Your response
                    <ChevronRight className={`w-4 h-4 ml-auto transition-transform ${showDraft ? 'rotate-90' : ''}`} />
                </button>
                {showDraft && (
                    <p className="mt-3 pt-3 border-t border-white/8 text-sm text-white/50 leading-relaxed whitespace-pre-wrap">
                        {draft}
                    </p>
                )}
            </div>

            <Button
                onClick={onNext}
                className="w-full bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-500/30"
            >
                Next Exercise
            </Button>
        </motion.div>
    )
}
