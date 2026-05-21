'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowLeft, Save, Sparkles, ZapIcon, CheckCircle2, AlertTriangle, Target as TargetIcon,
    Clock, Trophy, Lightbulb, ChevronDown, ChevronRight, Plus, Trash2, Layers,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    useEssay, useEssayUpdate, useEssayQuickCheck, useEssayDeepReview, useEssayAttempts,
    useEssayPlan, useEssayPlanUpdate,
    type Essay, type EssayDeepSentence, type EssayAttempt,
    type EssayPlanBody, type EssayStructureCoverage, type EssayStructureCoverageBody,
} from '@/lib/hooks/use-essays'

const LEVEL_COLOR: Record<string, string> = {
    A1: 'text-green-400', A2: 'text-emerald-400',
    B1: 'text-blue-400', B2: 'text-indigo-400',
    C1: 'text-purple-400', C2: 'text-rose-400',
}

const ISSUE_COLOR: Record<string, string> = {
    grammar: 'border-rose-500/30 bg-rose-500/5',
    vocab: 'border-amber-500/30 bg-amber-500/5',
    style: 'border-sky-500/30 bg-sky-500/5',
    cohesion: 'border-violet-500/30 bg-violet-500/5',
    clarity: 'border-emerald-500/30 bg-emerald-500/5',
    upgrade: 'border-amber-500/30 bg-amber-500/5',
}

const HIGHLIGHT_COLOR: Record<string, string> = {
    grammar: 'bg-rose-500/20 text-rose-100 border-b-2 border-rose-400/60',
    vocab: 'bg-amber-500/20 text-amber-100 border-b-2 border-amber-400/60',
    style: 'bg-sky-500/20 text-sky-100 border-b-2 border-sky-400/60',
    cohesion: 'bg-violet-500/20 text-violet-100 border-b-2 border-violet-400/60',
    clarity: 'bg-emerald-500/20 text-emerald-100 border-b-2 border-emerald-400/60',
    upgrade: 'bg-amber-500/15 text-amber-100 border-b-2 border-dashed border-amber-400/60',
    task_response: 'bg-rose-500/20 text-rose-100 border-b-2 border-rose-400/60',
}

type HighlightItem = {
    key: string                // stable id, e.g. "s-0" or "v-2"
    kind: 'sentence' | 'upgrade'
    issue: string              // sentence.issue or 'upgrade'
    original: string
    explanation: string
    suggestion: string
}

type HighlightSegment =
    | { type: 'text'; text: string }
    | { type: 'mark'; text: string; item: HighlightItem; order: number }

function countWords(s: string) {
    if (!s) return 0
    const m = s.match(/\b[\w'\-]+\b/g)
    return m ? m.length : 0
}

function buildHighlightItems(review: Essay['deep_review']): HighlightItem[] {
    if (!review) return []
    const sentences: HighlightItem[] = (review.sentences || []).map((s, i) => ({
        key: `s-${i}`,
        kind: 'sentence',
        issue: (s.issue || 'clarity').toLowerCase(),
        original: s.original || '',
        explanation: s.explanation || '',
        suggestion: s.suggestion || '',
    }))
    const upgrades: HighlightItem[] = (review.vocabulary_upgrades || []).map((u, i) => ({
        key: `v-${i}`,
        kind: 'upgrade',
        issue: 'upgrade',
        original: u.from || '',
        explanation: u.why || '',
        suggestion: u.to || '',
    }))
    return [...sentences, ...upgrades]
}

function segmentBodyForHighlights(body: string, items: HighlightItem[]): {
    segments: HighlightSegment[]
    missing: HighlightItem[]
    orderByKey: Record<string, number>
} {
    if (!body || items.length === 0) {
        return { segments: [{ type: 'text', text: body || '' }], missing: items, orderByKey: {} }
    }
    const lower = body.toLowerCase()
    type Range = { start: number; end: number; item: HighlightItem }
    const ranges: Range[] = []
    const missing: HighlightItem[] = []

    for (const item of items) {
        const needle = (item.original || '').trim()
        if (!needle) {
            missing.push(item)
            continue
        }
        const lowerNeedle = needle.toLowerCase()
        let from = 0
        let placed = false
        while (from < lower.length) {
            const pos = lower.indexOf(lowerNeedle, from)
            if (pos === -1) break
            const end = pos + needle.length
            const overlaps = ranges.some(r => !(end <= r.start || pos >= r.end))
            if (!overlaps) {
                ranges.push({ start: pos, end, item })
                placed = true
                break
            }
            from = pos + 1
        }
        if (!placed) missing.push(item)
    }

    ranges.sort((a, b) => a.start - b.start)

    const orderByKey: Record<string, number> = {}
    ranges.forEach((r, i) => { orderByKey[r.item.key] = i + 1 })

    const segments: HighlightSegment[] = []
    let cursor = 0
    for (const r of ranges) {
        if (r.start > cursor) segments.push({ type: 'text', text: body.slice(cursor, r.start) })
        segments.push({
            type: 'mark',
            text: body.slice(r.start, r.end),
            item: r.item,
            order: orderByKey[r.item.key],
        })
        cursor = r.end
    }
    if (cursor < body.length) segments.push({ type: 'text', text: body.slice(cursor) })

    return { segments, missing, orderByKey }
}

export default function EssayEditorPage() {
    const params = useParams<{ id: string; essayId: string }>()
    const router = useRouter()
    const essayId = Number(params.essayId)

    const { data: essay, isLoading } = useEssay(essayId)
    const { data: attempts = [] } = useEssayAttempts(essayId)
    const { mutate: update, isPending: saving } = useEssayUpdate()
    const { mutate: quickCheck, isPending: checking, error: quickError } = useEssayQuickCheck()
    const { mutate: deepReview, isPending: reviewing, error: deepError } = useEssayDeepReview()

    const [body, setBody] = useState('')
    const [title, setTitle] = useState('')
    const [dirty, setDirty] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [activeHighlight, setActiveHighlight] = useState<string | null>(null)
    const tickRef = useRef<number>(0)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        if (essay && !dirty) {
            setBody(essay.body || '')
            setTitle(essay.title || '')
        }
    }, [essay, dirty])

    // Time tracker — runs while page is open
    useEffect(() => {
        if (!essay) return
        timerRef.current = setInterval(() => { tickRef.current += 1 }, 1000)
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [essay])

    const wordCount = useMemo(() => countWords(body), [body])
    const target = essay?.target_word_count || 0
    const progress = target > 0 ? Math.min(100, Math.round((wordCount / target) * 100)) : 0

    const usedTargets = useMemo(() => {
        if (!essay?.target_words?.length) return new Set<string>()
        const lower = body.toLowerCase()
        return new Set(essay.target_words.filter(w => lower.includes(w.toLowerCase())).map(w => w.toLowerCase()))
    }, [body, essay?.target_words])

    const highlightItems = useMemo(() => buildHighlightItems(essay?.deep_review ?? null), [essay?.deep_review])
    const highlight = useMemo(
        () => segmentBodyForHighlights(essay?.body || '', highlightItems),
        [essay?.body, highlightItems],
    )
    const reviewedAndUnedited = Boolean(
        essay?.deep_review && !dirty && (essay?.body || '') === body,
    )
    const showHighlights = reviewedAndUnedited && !editMode

    const persistedTimeRef = useRef(0)
    useEffect(() => {
        if (essay) persistedTimeRef.current = essay.time_spent_seconds
    }, [essay])

    const handleSave = () => {
        if (!essay) return
        const elapsed = tickRef.current
        update(
            {
                id: essay.id,
                data: {
                    body,
                    title: title || null,
                    time_spent_seconds: persistedTimeRef.current + elapsed,
                },
            },
            {
                onSuccess: () => {
                    persistedTimeRef.current += elapsed
                    tickRef.current = 0
                    setDirty(false)
                },
            },
        )
    }

    const handleQuickCheck = () => {
        if (!essay) return
        // Save first
        update(
            {
                id: essay.id,
                data: { body, title: title || null, time_spent_seconds: persistedTimeRef.current + tickRef.current },
            },
            { onSuccess: () => quickCheck(essay.id) },
        )
    }

    const handleDeepReview = () => {
        if (!essay) return
        update(
            {
                id: essay.id,
                data: {
                    body,
                    title: title || null,
                    time_spent_seconds: persistedTimeRef.current + tickRef.current,
                    status: 'submitted',
                },
            },
            { onSuccess: () => deepReview(essay.id) },
        )
    }

    if (isLoading || !essay) {
        return (
            <div className="min-h-screen p-4 sm:p-6 lg:p-8">
                <p className="text-white/40">Loading…</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
                <button
                    onClick={() => router.push(`/platform/${params.id}/learning/writing`)}
                    className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm">Back to Writing</span>
                </button>

                {/* Prompt header */}
                <Card className="p-4 sm:p-5 mb-6 bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-start justify-between gap-3 sm:gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-semibold ${LEVEL_COLOR[essay.level]}`}>{essay.level}</span>
                                <span className="text-xs text-white/30">•</span>
                                <span className="text-xs text-white/50 capitalize">{essay.status}</span>
                            </div>
                            <p className="text-sm sm:text-base text-white/90 leading-relaxed">{essay.prompt}</p>
                        </div>
                        {target > 0 && (
                            <div className="text-right shrink-0">
                                <p className="text-xl sm:text-2xl font-bold text-white">{wordCount}<span className="text-white/30 text-xs sm:text-sm">/{target}</span></p>
                                <p className="text-[10px] uppercase tracking-wider text-white/40">words</p>
                            </div>
                        )}
                    </div>

                    {/* Target words */}
                    {essay.target_words && essay.target_words.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-amber-500/10">
                            <p className="text-xs uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1">
                                <TargetIcon className="w-3 h-3" /> Try to use
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {essay.target_words.map(w => {
                                    const used = usedTargets.has(w.toLowerCase())
                                    return (
                                        <span
                                            key={w}
                                            className={
                                                used
                                                    ? 'px-2 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                                    : 'px-2 py-0.5 rounded text-xs bg-white/5 text-white/60 border border-white/10'
                                            }
                                        >
                                            {used && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                                            {w}
                                        </span>
                                    )
                                })}
                            </div>
                            <p className="text-[10px] text-white/30 mt-2">
                                {usedTargets.size}/{essay.target_words.length} used
                            </p>
                        </div>
                    )}

                    {target > 0 && (
                        <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                className="h-full bg-amber-400"
                            />
                        </div>
                    )}
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Editor */}
                    <div className="lg:col-span-2 space-y-4">
                        <PlannerPanel essayId={essay.id} />

                        <input
                            type="text"
                            placeholder="Title (optional)"
                            value={title}
                            onChange={(e) => { setTitle(e.target.value); setDirty(true) }}
                            className="w-full bg-transparent text-xl sm:text-2xl font-semibold text-white placeholder:text-white/30 outline-none border-b border-transparent focus:border-amber-500/30 pb-2"
                        />

                        {showHighlights ? (
                            <HighlightedEssayView
                                segments={highlight.segments}
                                missing={highlight.missing}
                                activeKey={activeHighlight}
                                onSelect={(key) => setActiveHighlight(prev => prev === key ? null : key)}
                                onEdit={() => { setEditMode(true); setActiveHighlight(null) }}
                            />
                        ) : (
                            <>
                                {reviewedAndUnedited && (
                                    <div className="flex items-center justify-between gap-2 -mt-1 mb-2">
                                        <p className="text-xs text-white/40">Editing — switch back to inline feedback view.</p>
                                        <Button
                                            variant="ghost"
                                            onClick={() => setEditMode(false)}
                                            className="h-8 px-3 text-xs text-white/60 hover:text-white"
                                        >
                                            View feedback
                                        </Button>
                                    </div>
                                )}
                                <textarea
                                    value={body}
                                    onChange={(e) => { setBody(e.target.value); setDirty(true) }}
                                    placeholder="Start writing…"
                                    rows={20}
                                    className="w-full bg-[#0f0f1a] border border-[#2a2b36] focus:border-amber-500/40 rounded-lg p-4 text-white placeholder:text-white/30 resize-y leading-relaxed outline-none transition-colors"
                                    style={{ minHeight: '420px' }}
                                />
                            </>
                        )}

                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-3 text-xs text-white/50">
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {Math.floor((persistedTimeRef.current + tickRef.current) / 60)}m
                                </span>
                                <span>{wordCount} words</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="ghost"
                                    onClick={handleSave}
                                    disabled={saving || !dirty}
                                    className="text-white/70 hover:text-white"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    {saving ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
                                </Button>
                                <Button
                                    onClick={handleQuickCheck}
                                    disabled={checking || !body.trim()}
                                    className="bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
                                >
                                    <ZapIcon className="w-4 h-4 mr-2" />
                                    {checking ? 'Checking…' : 'Quick check'}
                                </Button>
                                <Button
                                    onClick={handleDeepReview}
                                    disabled={reviewing || !body.trim()}
                                    className="bg-amber-500 hover:bg-amber-500/90 text-black"
                                >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    {reviewing ? 'Reviewing…' : 'Deep review'}
                                </Button>
                            </div>
                        </div>

                        {(quickError || deepError) && (
                            <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-sm text-rose-300">
                                {(quickError || deepError)?.message}
                            </div>
                        )}
                    </div>

                    {/* Feedback panel */}
                    <div className="space-y-4">
                        {attempts.length > 0 && <AttemptHistory attempts={attempts} />}
                        {essay.deep_score !== null && essay.deep_review ? (
                            <DeepReviewPanel
                                essay={essay}
                                items={highlightItems}
                                orderByKey={highlight.orderByKey}
                                missing={highlight.missing}
                                activeKey={activeHighlight}
                                onSelect={(key) => setActiveHighlight(prev => prev === key ? null : key)}
                            />
                        ) : essay.quick_score !== null && essay.quick_feedback ? (
                            <QuickFeedbackPanel essay={essay} />
                        ) : (
                            <Card className="p-6 bg-white/2.5 border border-white/5 text-center">
                                <Lightbulb className="w-8 h-8 text-amber-400/50 mx-auto mb-2" />
                                <p className="text-sm text-white/60">
                                    Quick check gives a fast score and 3 suggestions.<br />
                                    Deep review gives sentence-by-sentence feedback.
                                </p>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function QuickFeedbackPanel({ essay }: { essay: Essay }) {
    const fb = essay.quick_feedback!
    return (
        <Card className="p-4 sm:p-5 bg-white/2.5 border border-amber-500/20">
            <div className="flex items-center justify-between mb-4 gap-3">
                <h3 className="font-semibold text-white flex items-center gap-2 min-w-0">
                    <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                    Quick check
                </h3>
                <div className="text-right shrink-0">
                    <p className="text-2xl sm:text-3xl font-bold text-amber-400">{essay.quick_score}</p>
                    {fb.level_estimate && (
                        <p className="text-[10px] text-white/40">est. {fb.level_estimate}</p>
                    )}
                </div>
            </div>

            <Section title="Strengths" items={fb.strengths} color="text-emerald-300" Icon={CheckCircle2} />
            <Section title="Improvements" items={fb.improvements} color="text-rose-300" Icon={AlertTriangle} />
            <Section title="Suggestions" items={fb.suggestions} color="text-sky-300" Icon={Lightbulb} />
        </Card>
    )
}

function Section({ title, items, color, Icon }: { title: string; items: string[]; color: string; Icon: React.ComponentType<{ className?: string }> }) {
    if (!items || items.length === 0) return null
    return (
        <div className="mb-4 last:mb-0">
            <p className={`text-xs uppercase tracking-wider ${color} mb-2 flex items-center gap-1`}>
                <Icon className="w-3 h-3" /> {title}
            </p>
            <ul className="space-y-1.5">
                {items.map((s, i) => (
                    <li key={i} className="text-sm text-white/80 leading-relaxed">• {s}</li>
                ))}
            </ul>
        </div>
    )
}

type DeepReviewPanelProps = {
    essay: Essay
    items: HighlightItem[]
    orderByKey: Record<string, number>
    missing: HighlightItem[]
    activeKey: string | null
    onSelect: (key: string) => void
}

function DeepReviewPanel({ essay, items, orderByKey, missing, activeKey, onSelect }: DeepReviewPanelProps) {
    const review = essay.deep_review!
    const missingKeys = useMemo(() => new Set(missing.map(m => m.key)), [missing])

    useEffect(() => {
        if (!activeKey) return
        const el = document.getElementById(`fb-${activeKey}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, [activeKey])

    const sentenceItems = items.filter(i => i.kind === 'sentence')
    const upgradeItems = items.filter(i => i.kind === 'upgrade')

    return (
        <div className="space-y-4">
            <Card className="p-4 sm:p-5 bg-white/2.5 border border-amber-500/30">
                <div className="flex items-center justify-between mb-4 gap-3">
                    <h3 className="font-semibold text-white flex items-center gap-2 min-w-0">
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                        Deep review
                    </h3>
                    <div className="text-right shrink-0">
                        <p className="text-2xl sm:text-3xl font-bold text-amber-400">{essay.deep_score}</p>
                        {review.level_estimate && (
                            <p className="text-[10px] text-white/40">est. {review.level_estimate}</p>
                        )}
                    </div>
                </div>

                {review.overall && (
                    <p className="text-sm text-white/80 leading-relaxed mb-4">{review.overall}</p>
                )}

                <div className="grid grid-cols-2 gap-2">
                    <CriterionBar label="Task response" value={review.criteria.task_response} />
                    <CriterionBar label="Coherence" value={review.criteria.coherence_cohesion} />
                    <CriterionBar label="Vocabulary" value={review.criteria.vocabulary} />
                    <CriterionBar label="Grammar" value={review.criteria.grammar} />
                </div>
            </Card>

            {review.structure_coverage && (
                <StructureCoverageCard coverage={review.structure_coverage} />
            )}

            {sentenceItems.length > 0 && (
                <Card className="p-5 bg-white/2.5 border border-white/10">
                    <h4 className="text-sm uppercase tracking-wider text-white/60 mb-3">Sentence fixes</h4>
                    <div className="space-y-3">
                        {sentenceItems.map(item => (
                            <FeedbackCard
                                key={item.key}
                                item={item}
                                order={orderByKey[item.key]}
                                active={activeKey === item.key}
                                missing={missingKeys.has(item.key)}
                                onSelect={() => onSelect(item.key)}
                            />
                        ))}
                    </div>
                </Card>
            )}

            {upgradeItems.length > 0 && (
                <Card className="p-5 bg-white/2.5 border border-white/10">
                    <h4 className="text-sm uppercase tracking-wider text-white/60 mb-3">Vocab upgrades</h4>
                    <div className="space-y-2">
                        {upgradeItems.map(item => {
                            const order = orderByKey[item.key]
                            const isMissing = missingKeys.has(item.key)
                            const isActive = activeKey === item.key
                            return (
                                <button
                                    key={item.key}
                                    id={`fb-${item.key}`}
                                    type="button"
                                    onClick={() => onSelect(item.key)}
                                    className={
                                        'w-full text-left text-sm flex items-start gap-2 rounded px-2 py-1.5 transition-colors ' +
                                        (isActive
                                            ? 'bg-amber-500/15 ring-1 ring-amber-500/40'
                                            : 'hover:bg-white/2.5')
                                    }
                                >
                                    {order ? (
                                        <span className="shrink-0 mt-0.5 inline-flex w-5 h-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold">
                                            {order}
                                        </span>
                                    ) : (
                                        <span className="shrink-0 mt-0.5 inline-flex w-5 h-5 items-center justify-center rounded-full bg-white/5 text-white/30 text-[10px]">
                                            –
                                        </span>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div>
                                            <span className="text-rose-300">{item.original}</span>
                                            <span className="text-white/30 mx-2">→</span>
                                            <span className="text-emerald-300 font-medium">{item.suggestion}</span>
                                        </div>
                                        {item.explanation && <p className="text-xs text-white/50 mt-0.5">{item.explanation}</p>}
                                        {isMissing && (
                                            <p className="text-[10px] text-white/30 mt-0.5 italic">not in current text</p>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </Card>
            )}
        </div>
    )
}

function FeedbackCard({ item, order, active, missing, onSelect }: {
    item: HighlightItem
    order: number | undefined
    active: boolean
    missing: boolean
    onSelect: () => void
}) {
    const cls = ISSUE_COLOR[item.issue] || 'border-white/10 bg-white/2.5'
    return (
        <button
            id={`fb-${item.key}`}
            type="button"
            onClick={onSelect}
            className={
                `w-full text-left p-3 rounded-md border transition-all ${cls} ` +
                (active ? 'ring-2 ring-amber-400/60 shadow-[0_0_0_2px_rgba(251,191,36,0.15)]' : '')
            }
        >
            <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                    {order ? (
                        <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold">
                            {order}
                        </span>
                    ) : (
                        <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-white/5 text-white/30 text-[10px]">
                            –
                        </span>
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-white/40">{item.issue || 'note'}</span>
                </div>
                {missing && (
                    <span className="text-[10px] text-white/30 italic">not in current text</span>
                )}
            </div>
            <p className="text-sm text-white/80 italic">&ldquo;{item.original}&rdquo;</p>
            {item.explanation && <p className="text-xs text-white/60 mt-1">{item.explanation}</p>}
            {item.suggestion && (
                <p className="text-sm text-emerald-300 mt-2">→ {item.suggestion}</p>
            )}
        </button>
    )
}

function CriterionBar({ label, value }: { label: string; value: number }) {
    const pct = Math.round((value / 25) * 100)
    return (
        <div>
            <div className="flex justify-between text-xs mb-1">
                <span className="text-white/60">{label}</span>
                <span className="text-white/80 font-medium">{value}/25</span>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
            </div>
        </div>
    )
}

function AttemptHistory({ attempts }: { attempts: EssayAttempt[] }) {
    const sorted = [...attempts].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const latest = sorted[sorted.length - 1]
    const first = sorted[0]
    const delta = sorted.length > 1 ? latest.score - first.score : null

    return (
        <Card className="p-4 bg-white/2.5 border border-white/10">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs uppercase tracking-wider text-white/60">Score history</h4>
                {delta !== null && (
                    <span className={delta >= 0 ? 'text-xs font-semibold text-emerald-400' : 'text-xs font-semibold text-rose-400'}>
                        {delta >= 0 ? '+' : ''}{delta} since first
                    </span>
                )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
                {sorted.map((a, i) => {
                    const isLast = i === sorted.length - 1
                    return (
                        <div key={a.id} className="flex items-center gap-1">
                            <div
                                title={`${a.kind} — ${new Date(a.created_at).toLocaleString()}`}
                                className={
                                    a.kind === 'deep'
                                        ? 'min-w-[2.5rem] px-2 py-1.5 rounded text-center text-sm font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300'
                                        : 'min-w-[2.5rem] px-2 py-1.5 rounded text-center text-sm font-semibold bg-white/5 border border-white/10 text-white/80'
                                }
                            >
                                {a.score}
                            </div>
                            {!isLast && <span className="text-white/30 text-xs">→</span>}
                        </div>
                    )
                })}
            </div>
            <p className="text-[10px] text-white/40 mt-2">
                {sorted.length} attempt{sorted.length === 1 ? '' : 's'}
                <span className="ml-2">
                    <span className="inline-block w-2 h-2 rounded bg-amber-500/40 mr-1" />deep
                    <span className="inline-block w-2 h-2 rounded bg-white/20 ml-2 mr-1" />quick
                </span>
            </p>
        </Card>
    )
}

// ─── Planner ─────────────────────────────────────────────────────────────────

const EMPTY_BODY: EssayPlanBody = { label: '', claim: '', what_kind: '', so_what: '', what_if: '' }

function bodyHasContent(b: EssayPlanBody): boolean {
    return Boolean(
        (b.label || '').trim() ||
        (b.claim || '').trim() ||
        (b.what_kind || '').trim() ||
        (b.so_what || '').trim() ||
        (b.what_if || '').trim(),
    )
}

function planIsEmpty(thesis: string, bodies: EssayPlanBody[], conclusion: string): boolean {
    return !thesis.trim() && !conclusion.trim() && !bodies.some(bodyHasContent)
}

function PlannerPanel({ essayId }: { essayId: number }) {
    const { data: plan, isLoading } = useEssayPlan(essayId)
    const { mutate: savePlan, isPending: saving } = useEssayPlanUpdate()

    const [thesis, setThesis] = useState('')
    const [conclusion, setConclusion] = useState('')
    const [bodies, setBodies] = useState<EssayPlanBody[]>([{ ...EMPTY_BODY, label: 'Body 1' }, { ...EMPTY_BODY, label: 'Body 2' }])
    const [hydrated, setHydrated] = useState(false)
    const [open, setOpen] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [saved, setSaved] = useState<string | null>(null)

    useEffect(() => {
        if (!plan || hydrated) return
        setThesis(plan.thesis || '')
        setConclusion(plan.conclusion_plan || '')
        if (plan.body_plans && plan.body_plans.length > 0) {
            setBodies(plan.body_plans.map(b => ({
                label: b.label ?? '',
                claim: b.claim ?? '',
                what_kind: b.what_kind ?? '',
                so_what: b.so_what ?? '',
                what_if: b.what_if ?? '',
            })))
        }
        const hasContent = Boolean(
            (plan.thesis || '').trim() ||
            (plan.conclusion_plan || '').trim() ||
            (plan.body_plans || []).some(bodyHasContent),
        )
        // Default open the first time we visit an essay with no plan yet, so the
        // learner sees the scaffold; collapse it once they've filled it in.
        setOpen(!hasContent)
        setHydrated(true)
    }, [plan, hydrated])

    const completion = useMemo(() => {
        let filled = 0
        let total = 0
        if (thesis !== undefined) { total += 1; if (thesis.trim()) filled += 1 }
        for (const b of bodies) {
            total += 4
            if ((b.claim || '').trim()) filled += 1
            if ((b.what_kind || '').trim()) filled += 1
            if ((b.so_what || '').trim()) filled += 1
            if ((b.what_if || '').trim()) filled += 1
        }
        total += 1
        if (conclusion.trim()) filled += 1
        return { filled, total, pct: total ? Math.round((filled / total) * 100) : 0 }
    }, [thesis, bodies, conclusion])

    const empty = planIsEmpty(thesis, bodies, conclusion)

    const updateBody = (idx: number, patch: Partial<EssayPlanBody>) => {
        setBodies(prev => prev.map((b, i) => i === idx ? { ...b, ...patch } : b))
        setDirty(true)
        setSaved(null)
    }

    const addBody = () => {
        setBodies(prev => [...prev, { ...EMPTY_BODY, label: `Body ${prev.length + 1}` }])
        setDirty(true)
        setSaved(null)
    }

    const removeBody = (idx: number) => {
        setBodies(prev => prev.filter((_, i) => i !== idx))
        setDirty(true)
        setSaved(null)
    }

    const handleSave = () => {
        savePlan(
            {
                id: essayId,
                data: {
                    thesis: thesis.trim() || null,
                    conclusion_plan: conclusion.trim() || null,
                    body_plans: bodies.map(b => ({
                        label: (b.label || '').trim() || null,
                        claim: (b.claim || '').trim() || null,
                        what_kind: (b.what_kind || '').trim() || null,
                        so_what: (b.so_what || '').trim() || null,
                        what_if: (b.what_if || '').trim() || null,
                    })),
                },
            },
            {
                onSuccess: () => {
                    setDirty(false)
                    setSaved(new Date().toLocaleTimeString())
                },
            },
        )
    }

    return (
        <Card className="p-0 bg-white/2.5 border border-violet-500/20 overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-violet-500/5 transition-colors"
            >
                <div className="flex items-center gap-2">
                    {open ? (
                        <ChevronDown className="w-4 h-4 text-violet-300" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-violet-300" />
                    )}
                    <Layers className="w-4 h-4 text-violet-300" />
                    <span className="text-sm font-semibold text-white">Plan your structure</span>
                    {!empty && (
                        <span className="text-[10px] text-white/40 ml-1">
                            {completion.filled}/{completion.total} slots
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {empty && (
                        <span className="text-[10px] uppercase tracking-wider text-violet-300/80">
                            Recommended
                        </span>
                    )}
                    {!empty && (
                        <div className="w-20 h-1 rounded-full bg-white/5 overflow-hidden">
                            <div
                                className="h-full bg-violet-400"
                                style={{ width: `${completion.pct}%` }}
                            />
                        </div>
                    )}
                </div>
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 space-y-4 border-t border-violet-500/10">
                            <p className="text-xs text-white/50 mt-3 leading-relaxed">
                                Before writing, jot down your thesis and the four scaffolding moves
                                for each body paragraph. Deep review will check whether the finished
                                essay actually delivers each slot.
                            </p>

                            <div>
                                <label className="text-[11px] uppercase tracking-wider text-violet-300 mb-1 block">
                                    Thesis / position
                                </label>
                                <textarea
                                    value={thesis}
                                    onChange={(e) => { setThesis(e.target.value); setDirty(true); setSaved(null) }}
                                    placeholder="State your overall argument or position…"
                                    rows={2}
                                    className="w-full bg-[#0f0f1a] border border-[#2a2b36] focus:border-violet-500/40 rounded p-2 text-sm text-white placeholder:text-white/30 resize-y outline-none transition-colors"
                                />
                            </div>

                            <div className="space-y-3">
                                {bodies.map((b, i) => (
                                    <BodyPlanCard
                                        key={i}
                                        index={i}
                                        body={b}
                                        canRemove={bodies.length > 1}
                                        onChange={(patch) => updateBody(i, patch)}
                                        onRemove={() => removeBody(i)}
                                    />
                                ))}
                                <button
                                    onClick={addBody}
                                    className="w-full text-xs text-violet-300 hover:text-violet-200 py-2 border border-dashed border-violet-500/30 rounded hover:bg-violet-500/5 transition-colors flex items-center justify-center gap-1"
                                >
                                    <Plus className="w-3 h-3" />
                                    Add another body paragraph
                                </button>
                            </div>

                            <div>
                                <label className="text-[11px] uppercase tracking-wider text-violet-300 mb-1 block">
                                    Conclusion plan (optional)
                                </label>
                                <textarea
                                    value={conclusion}
                                    onChange={(e) => { setConclusion(e.target.value); setDirty(true); setSaved(null) }}
                                    placeholder="How will you wrap up — restate, recommend, predict…"
                                    rows={2}
                                    className="w-full bg-[#0f0f1a] border border-[#2a2b36] focus:border-violet-500/40 rounded p-2 text-sm text-white placeholder:text-white/30 resize-y outline-none transition-colors"
                                />
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-1">
                                <p className="text-[10px] text-white/40">
                                    {isLoading
                                        ? 'Loading plan…'
                                        : saved
                                            ? `Saved at ${saved}`
                                            : dirty
                                                ? 'Unsaved changes'
                                                : 'Plan up to date'}
                                </p>
                                <Button
                                    onClick={handleSave}
                                    disabled={saving || !dirty}
                                    className="h-8 px-3 text-xs bg-violet-500/15 text-violet-200 border border-violet-500/30 hover:bg-violet-500/25"
                                >
                                    <Save className="w-3 h-3 mr-1.5" />
                                    {saving ? 'Saving…' : dirty ? 'Save plan' : 'Saved'}
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    )
}

function BodyPlanCard({ index, body, canRemove, onChange, onRemove }: {
    index: number
    body: EssayPlanBody
    canRemove: boolean
    onChange: (patch: Partial<EssayPlanBody>) => void
    onRemove: () => void
}) {
    return (
        <div className="rounded-md border border-violet-500/15 bg-violet-500/5 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
                <input
                    type="text"
                    value={body.label || ''}
                    onChange={(e) => onChange({ label: e.target.value })}
                    placeholder={`Body ${index + 1}`}
                    className="bg-transparent text-sm font-semibold text-violet-200 placeholder:text-violet-300/50 outline-none flex-1 min-w-0"
                />
                {canRemove && (
                    <button
                        onClick={onRemove}
                        className="text-white/30 hover:text-rose-400 transition-colors p-1"
                        title="Remove body paragraph"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <SlotInput
                    label="Claim (why?)"
                    placeholder="e.g. Academic learning"
                    value={body.claim || ''}
                    onChange={(v) => onChange({ claim: v })}
                />
                <SlotInput
                    label="What kind?"
                    placeholder="e.g. critical thinking, foundation"
                    value={body.what_kind || ''}
                    onChange={(v) => onChange({ what_kind: v })}
                />
                <SlotInput
                    label="So what?"
                    placeholder="e.g. ability to handle complex tasks"
                    value={body.so_what || ''}
                    onChange={(v) => onChange({ so_what: v })}
                />
                <SlotInput
                    label="What if not?"
                    placeholder="e.g. lack of ideas, weaker analysis"
                    value={body.what_if || ''}
                    onChange={(v) => onChange({ what_if: v })}
                />
            </div>
        </div>
    )
}

function SlotInput({ label, placeholder, value, onChange }: {
    label: string
    placeholder: string
    value: string
    onChange: (v: string) => void
}) {
    return (
        <div>
            <label className="text-[10px] uppercase tracking-wider text-violet-300/80 mb-1 block">
                {label}
            </label>
            <input
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-[#0f0f1a] border border-[#2a2b36] focus:border-violet-500/40 rounded px-2 py-1.5 text-xs text-white placeholder:text-white/30 outline-none transition-colors"
            />
        </div>
    )
}

function StructureCoverageCard({ coverage }: { coverage: EssayStructureCoverage }) {
    return (
        <Card className="p-5 bg-white/2.5 border border-violet-500/20">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-300" />
                    Plan coverage
                </h4>
                <div className="text-right">
                    <p className="text-2xl font-bold text-violet-300">
                        {coverage.overall_score}<span className="text-white/30 text-sm">/25</span>
                    </p>
                </div>
            </div>

            {coverage.summary && (
                <p className="text-sm text-white/80 leading-relaxed mb-3">{coverage.summary}</p>
            )}

            <div className="flex items-center gap-3 text-xs text-white/60 mb-3">
                <CoverageDot ok={coverage.thesis_present} label="thesis" />
                <CoverageDot ok={coverage.conclusion_present} label="conclusion" />
            </div>

            {coverage.bodies && coverage.bodies.length > 0 && (
                <div className="space-y-2">
                    {coverage.bodies.map((b, i) => (
                        <BodyCoverageRow key={i} body={b} fallbackIndex={i} />
                    ))}
                </div>
            )}
        </Card>
    )
}

function BodyCoverageRow({ body, fallbackIndex }: { body: EssayStructureCoverageBody; fallbackIndex: number }) {
    return (
        <div className="rounded-md border border-violet-500/10 bg-violet-500/5 p-2.5">
            <p className="text-xs font-semibold text-violet-200 mb-1.5">
                {body.label || `Body ${fallbackIndex + 1}`}
            </p>
            <div className="flex flex-wrap gap-2 text-[11px]">
                <CoverageDot ok={body.claim_covered} label="claim" />
                <CoverageDot ok={body.what_kind_covered} label="what kind" />
                <CoverageDot ok={body.so_what_covered} label="so what" />
                <CoverageDot ok={body.what_if_covered} label="what if" />
            </div>
            {body.notes && (
                <p className="text-xs text-white/60 mt-2">{body.notes}</p>
            )}
        </div>
    )
}

function CoverageDot({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span className={
            ok
                ? 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300'
                : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300'
        }>
            {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            {label}
        </span>
    )
}

// ─── Highlighted essay view ──────────────────────────────────────────────────

function HighlightedEssayView({ segments, missing, activeKey, onSelect, onEdit }: {
    segments: HighlightSegment[]
    missing: HighlightItem[]
    activeKey: string | null
    onSelect: (key: string) => void
    onEdit: () => void
}) {
    useEffect(() => {
        if (!activeKey) return
        const el = document.getElementById(`mark-${activeKey}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, [activeKey])

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-white/40 flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    Reviewed view — click any highlight to focus its feedback card.
                </p>
                <Button
                    variant="ghost"
                    onClick={onEdit}
                    className="h-8 px-3 text-xs text-white/60 hover:text-white border border-white/10"
                >
                    Edit & resubmit
                </Button>
            </div>

            <div
                className="w-full bg-[#0f0f1a] border border-[#2a2b36] rounded-lg p-4 text-white leading-relaxed whitespace-pre-wrap"
                style={{ minHeight: '420px' }}
            >
                {segments.map((seg, idx) => {
                    if (seg.type === 'text') {
                        return <span key={idx}>{seg.text}</span>
                    }
                    const cls = HIGHLIGHT_COLOR[seg.item.issue] || HIGHLIGHT_COLOR.clarity
                    const active = activeKey === seg.item.key
                    return (
                        <span
                            key={idx}
                            id={`mark-${seg.item.key}`}
                            onClick={() => onSelect(seg.item.key)}
                            className={
                                `cursor-pointer rounded-sm px-0.5 transition-colors ${cls} ` +
                                (active ? 'ring-2 ring-amber-400/70' : 'hover:brightness-125')
                            }
                            title={seg.item.suggestion ? `${seg.item.explanation} → ${seg.item.suggestion}` : seg.item.explanation}
                        >
                            {seg.text}
                            <sup className="text-[9px] font-bold ml-0.5 text-white/70">{seg.order}</sup>
                        </span>
                    )
                })}
            </div>

            {missing.length > 0 && (
                <p className="text-[11px] text-white/40">
                    {missing.length} feedback item{missing.length === 1 ? '' : 's'} could not be matched to the current text — see the sidebar.
                </p>
            )}
        </div>
    )
}
