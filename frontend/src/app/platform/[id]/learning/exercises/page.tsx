'use client'

import { useCallback, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import {
    useGradeExercises,
    useStartExerciseSession,
    type ExerciseGradeResult,
    type ExerciseItem,
    type ExerciseMode,
    type Source,
} from '@/lib/hooks/use-exercises'
import { SetupPhase } from './_components/setup-phase'
import { AnswerPhase } from './_components/answer-phase'
import { GradingPhase } from './_components/grading-phase'
import { ResultsPhase } from './_components/results-phase'
import { StreakCelebration, StreakIndicator } from './_components/streak-ui'
import { useStreak } from './_components/use-streak'

type Phase = 'setup' | 'answer' | 'grading' | 'results'

export default function ExercisesPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()

    const [phase, setPhase] = useState<Phase>('setup')
    const [source, setSource] = useState<Source>('smart')
    const [mode, setMode] = useState<ExerciseMode>('auto')
    const [count, setCount] = useState<number>(5)
    const [folderId, setFolderId] = useState<number | undefined>(undefined)
    const [moduleId, setModuleId] = useState<number | undefined>(undefined)
    const [error, setError] = useState<string | null>(null)

    const [sessionId, setSessionId] = useState<number | undefined>(undefined)
    const [items, setItems] = useState<ExerciseItem[]>([])
    const [answers, setAnswers] = useState<Record<number, string>>({})
    const [results, setResults] = useState<ExerciseGradeResult[]>([])

    const startSession = useStartExerciseSession()
    const gradeExercises = useGradeExercises()
    const streak = useStreak()

    const startRun = useCallback(async () => {
        setError(null)
        streak.reset()
        try {
            const res = await startSession.mutateAsync({
                source,
                count,
                mode,
                folder_id: folderId,
                module_id: moduleId,
            })
            setSessionId(res.session_id)
            setItems(res.items)
            setAnswers({})
            setResults([])
            setPhase('answer')
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to start exercises.')
        }
    }, [startSession, source, count, mode, folderId, moduleId, streak])

    const submitAll = useCallback(async () => {
        setError(null)
        const gradeItems = items
            .map((item) => ({ word_id: item.word_id, response: (answers[item.word_id] ?? '').trim() }))
            .filter((it) => it.response.length > 0)

        if (gradeItems.length === 0) {
            setError('Answer at least one question before submitting.')
            return
        }

        setPhase('grading')
        try {
            const res = await gradeExercises.mutateAsync({ sessionId, items: gradeItems })
            // Register each result into streak as they arrive (keyed on word_id, guarded
            // against double-count inside registerResult)
            for (const r of res.results) {
                streak.registerResult(r.word_id, r.is_correct)
            }
            setResults(res.results)
            setPhase('results')
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Grader failed. Please try again.')
            setPhase('answer')
        }
    }, [items, answers, sessionId, gradeExercises, streak])

    const resetAll = useCallback(() => {
        setPhase('setup')
        setSessionId(undefined)
        setItems([])
        setAnswers({})
        setResults([])
        setError(null)
        streak.reset()
    }, [streak])

    const answeredCount = useMemo(
        () => Object.values(answers).filter((a) => a.trim().length > 0).length,
        [answers],
    )
    const correctCount = results.filter((r) => r.is_correct).length
    const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0

    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            {/* Streak celebration overlay — non-blocking, auto-dismisses */}
            <StreakCelebration tier={streak.justUnlocked} onDismiss={streak.dismissCelebration} />

            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <button
                        onClick={() =>
                            phase === 'setup'
                                ? router.push(`/platform/${params.id}/learning`)
                                : resetAll()
                        }
                        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="text-sm">
                            {phase === 'setup' ? 'Learning' : 'Back to setup'}
                        </span>
                    </button>

                    <div className="flex items-center gap-3">
                        {phase === 'answer' && (
                            <>
                                <StreakIndicator streak={streak.currentStreak} />
                                <span className="text-xs text-white/40">
                                    {answeredCount}/{items.length} answered
                                </span>
                            </>
                        )}
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {phase === 'setup' && (
                        <SetupPhase
                            key="setup"
                            source={source}
                            setSource={setSource}
                            mode={mode}
                            setMode={setMode}
                            count={count}
                            setCount={setCount}
                            folderId={folderId}
                            setFolderId={(v) => {
                                setFolderId(v)
                                setModuleId(undefined)
                            }}
                            moduleId={moduleId}
                            setModuleId={setModuleId}
                            startRun={startRun}
                            error={error}
                            isLoading={startSession.isPending}
                        />
                    )}

                    {phase === 'answer' && (
                        <AnswerPhase
                            key="answer"
                            items={items}
                            answers={answers}
                            setAnswers={setAnswers}
                            submitAll={submitAll}
                            isSubmitting={gradeExercises.isPending}
                            error={error}
                        />
                    )}

                    {phase === 'grading' && <GradingPhase key="grading" />}

                    {phase === 'results' && (
                        <ResultsPhase
                            key="results"
                            results={results}
                            items={items}
                            answers={answers}
                            correctCount={correctCount}
                            accuracy={accuracy}
                            bestStreak={streak.bestStreak}
                            onAgain={() => {
                                setAnswers({})
                                setResults([])
                                setPhase('answer')
                            }}
                            onDone={resetAll}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
