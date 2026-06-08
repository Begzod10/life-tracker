'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import {
    useExerciseWords,
    useGradeExercises,
    useStartExerciseSession,
    type ExerciseGradeResult,
    type ExerciseWord,
    type Source,
} from '@/lib/hooks/use-exercises'
import { SetupPhase } from './_components/setup-phase'
import { WritePhase } from './_components/write-phase'
import { GradingPhase } from './_components/grading-phase'
import { ResultsPhase } from './_components/results-phase'

type Phase = 'setup' | 'write' | 'grading' | 'results'

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

    const wordsQuery = useExerciseWords({ count, moduleId, folderId, source })
    const startSession = useStartExerciseSession()
    const gradeExercises = useGradeExercises()

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
                        <SetupPhase
                            key="setup"
                            source={source}
                            setSource={setSource}
                            count={count}
                            setCount={setCount}
                            folderId={folderId}
                            setFolderId={setFolderId}
                            moduleId={moduleId}
                            setModuleId={setModuleId}
                            startRun={startRun}
                            error={error}
                            isLoading={wordsQuery.isFetching || startSession.isPending}
                        />
                    )}

                    {phase === 'write' && (
                        <WritePhase
                            key="write"
                            words={words}
                            sentences={sentences}
                            setSentences={setSentences}
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
