'use client'

import { motion } from 'framer-motion'
import { Loader2, Volume2, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ExerciseItem, ExerciseType } from '@/lib/hooks/use-exercises'
import { ExerciseWidget } from './exercise-types'
import { MatchWidget } from './exercise-types/match-widget'
import { ClozeBankWidget } from './exercise-types/cloze-bank-widget'
import { DIFF_COLOR, speak } from './shared'

const TYPE_LABEL: Record<string, string> = {
    sentence: 'Write a sentence',
    constrained_sentence: 'Constrained sentence',
    paraphrase: 'Paraphrase',
    prompt_response: 'Prompt response',
    meaning_mc: 'Multiple choice',
    reverse_mc: 'Multiple choice',
    cloze: 'Fill in the blank',
    spelling: 'Spelling',
    anagram: 'Anagram',
    match: 'Matching',
    cloze_bank: 'Fill in the blanks',
    word_formation: 'Word formation',
    synonym_antonym: 'Synonym / antonym',
    odd_one_out: 'Odd one out',
    error_correction: 'Error correction',
}

// ─── Render-unit types ────────────────────────────────────────────────────────

const GROUPED_TYPES = new Set<ExerciseType>(['match', 'cloze_bank'])

type SingleUnit = { kind: 'single'; item: ExerciseItem; unitIndex: number }
type GroupUnit = {
    kind: 'group'
    groupId: string
    type: 'match' | 'cloze_bank'
    items: ExerciseItem[]
    unitIndex: number
}
type RenderUnit = SingleUnit | GroupUnit

function buildRenderUnits(items: ExerciseItem[]): RenderUnit[] {
    const units: RenderUnit[] = []
    const seenGroups = new Map<string, GroupUnit>()
    let unitIdx = 0

    for (const item of items) {
        const gid = item.group_id
        if (gid && GROUPED_TYPES.has(item.exercise_type)) {
            const existing = seenGroups.get(gid)
            if (existing) {
                existing.items.push(item)
            } else {
                const unit: GroupUnit = {
                    kind: 'group',
                    groupId: gid,
                    type: item.exercise_type as 'match' | 'cloze_bank',
                    items: [item],
                    unitIndex: unitIdx++,
                }
                seenGroups.set(gid, unit)
                units.push(unit)
            }
        } else {
            units.push({ kind: 'single', item, unitIndex: unitIdx++ })
        }
    }

    return units
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AnswerPhaseProps {
    items: ExerciseItem[]
    answers: Record<number, string>
    setAnswers: (updater: (prev: Record<number, string>) => Record<number, string>) => void
    submitAll: () => void
    isSubmitting: boolean
    error: string | null
}

// ─── Single-item card ─────────────────────────────────────────────────────────

function ExerciseCard({
    item,
    value,
    onChange,
    index,
    total,
}: {
    item: ExerciseItem
    value: string
    onChange: (v: string) => void
    index: number
    total: number
}) {
    const diffColor = DIFF_COLOR[item.difficulty ?? 'B1'] ?? 'text-white/40'

    return (
        <Card className="p-4 sm:p-5 bg-white/2.5 border border-white/5">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                    {item.word && (
                        <div className="flex items-center gap-1.5">
                            <h3 className="text-base font-semibold text-white">{item.word}</h3>
                            {item.part_of_speech && (
                                <span className="text-[11px] text-white/35 italic">{item.part_of_speech}</span>
                            )}
                        </div>
                    )}
                    {item.difficulty && (
                        <span className={`text-[11px] font-medium ${diffColor}`}>{item.difficulty}</span>
                    )}
                    {item.phonetic && (
                        <span className="text-[11px] text-white/35 font-mono">/{item.phonetic}/</span>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {item.word && (
                        <button
                            onClick={() => speak(item.word!)}
                            className="text-white/30 hover:text-white/60 transition-colors"
                        >
                            <Volume2 className="w-4 h-4" />
                        </button>
                    )}
                    <span className="text-xs text-white/30 tabular-nums">{index + 1}/{total}</span>
                </div>
            </div>

            <div className="mb-3">
                <span className="text-[10px] uppercase tracking-wider text-amber-300/60 font-medium">
                    {TYPE_LABEL[item.exercise_type] ?? item.exercise_type.replace(/_/g, ' ')}
                </span>
            </div>

            <ExerciseWidget item={item} value={value} onChange={onChange} disabled={false} />
        </Card>
    )
}

// ─── Group card (match / cloze_bank) ─────────────────────────────────────────

function GroupCard({
    unit,
    answers,
    setAnswer,
    index,
    total,
}: {
    unit: GroupUnit
    answers: Record<number, string>
    setAnswer: (wordId: number, value: string) => void
    index: number
    total: number
}) {
    return (
        <Card className="p-4 sm:p-5 bg-white/2.5 border border-white/5">
            <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] uppercase tracking-wider text-amber-300/60 font-medium">
                    {TYPE_LABEL[unit.type]} &mdash; {unit.items.length} words
                </span>
                <span className="text-xs text-white/30 tabular-nums">{index + 1}/{total}</span>
            </div>

            {unit.type === 'match' ? (
                <MatchWidget items={unit.items} answers={answers} setAnswer={setAnswer} />
            ) : (
                <ClozeBankWidget items={unit.items} answers={answers} setAnswer={setAnswer} />
            )}
        </Card>
    )
}

// ─── AnswerPhase ──────────────────────────────────────────────────────────────

export function AnswerPhase({
    items,
    answers,
    setAnswers,
    submitAll,
    isSubmitting,
    error,
}: AnswerPhaseProps) {
    const answeredCount = Object.values(answers).filter((a) => a.trim().length > 0).length
    const renderUnits = buildRenderUnits(items)
    const totalUnits = renderUnits.length

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 pb-28"
        >
            {renderUnits.map((unit) =>
                unit.kind === 'single' ? (
                    <ExerciseCard
                        key={unit.item.word_id}
                        item={unit.item}
                        value={answers[unit.item.word_id] ?? ''}
                        onChange={(v) =>
                            setAnswers((prev) => ({ ...prev, [unit.item.word_id]: v }))
                        }
                        index={unit.unitIndex}
                        total={totalUnits}
                    />
                ) : (
                    <GroupCard
                        key={unit.groupId}
                        unit={unit}
                        answers={answers}
                        setAnswer={(wordId, value) =>
                            setAnswers((prev) => ({ ...prev, [wordId]: value }))
                        }
                        index={unit.unitIndex}
                        total={totalUnits}
                    />
                ),
            )}

            {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
                    <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span className="text-sm text-red-200">{error}</span>
                </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0c0d15] via-[#0c0d15]/90 to-transparent pointer-events-none">
                <div className="max-w-3xl mx-auto pointer-events-auto">
                    <Button
                        onClick={submitAll}
                        disabled={isSubmitting || answeredCount === 0}
                        className="w-full h-12 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-medium shadow-lg"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Grading…
                            </>
                        ) : (
                            `Submit ${answeredCount > 0 ? `${answeredCount} answer${answeredCount > 1 ? 's' : ''}` : 'answers'}`
                        )}
                    </Button>
                </div>
            </div>
        </motion.div>
    )
}
