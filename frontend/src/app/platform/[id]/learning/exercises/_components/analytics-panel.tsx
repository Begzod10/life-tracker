'use client'

import { TrendingUp, Target, AlertTriangle, BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { useExerciseAnalytics } from '@/lib/hooks/use-exercises'

const TYPE_LABEL: Record<string, string> = {
    sentence: 'Sentence',
    constrained_sentence: 'Constrained',
    paraphrase: 'Paraphrase',
    prompt_response: 'Prompt',
    meaning_mc: 'Meaning MC',
    reverse_mc: 'Reverse MC',
    cloze: 'Cloze',
    spelling: 'Spelling',
    anagram: 'Anagram',
    match: 'Match',
    cloze_bank: 'Cloze Bank',
    word_formation: 'Word Form',
    synonym_antonym: 'Synonym/Ant',
    odd_one_out: 'Odd One Out',
}

function AccuracyBar({ accuracy, size = 'md' }: { accuracy: number; size?: 'sm' | 'md' }) {
    const color =
        accuracy >= 80 ? 'bg-emerald-500' : accuracy >= 60 ? 'bg-amber-500' : 'bg-red-500'
    const h = size === 'sm' ? 'h-1' : 'h-1.5'
    return (
        <div className={`w-full bg-white/10 rounded-full ${h}`}>
            <div
                className={`${h} rounded-full ${color} transition-all duration-500`}
                style={{ width: `${accuracy}%` }}
            />
        </div>
    )
}

export function AnalyticsPanel() {
    const [expanded, setExpanded] = useState(false)
    const { data, isLoading } = useExerciseAnalytics(30)

    if (isLoading) return null
    if (!data || data.total_attempts === 0) return null

    const recentTrend = data.accuracy_trend.slice(-7)
    const trendDir =
        recentTrend.length >= 2
            ? recentTrend[recentTrend.length - 1].accuracy - recentTrend[0].accuracy
            : 0

    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden mb-4">
            {/* Header row — always visible */}
            <button
                onClick={() => setExpanded((p) => !p)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-4">
                    <div className="text-center">
                        <div className="text-xl font-bold text-white">{data.overall_accuracy}%</div>
                        <div className="text-[10px] text-white/40 uppercase tracking-wider">accuracy</div>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="text-center">
                        <div className="text-xl font-bold text-white">{data.total_attempts}</div>
                        <div className="text-[10px] text-white/40 uppercase tracking-wider">attempts</div>
                    </div>
                    {data.avg_usage_score != null && (
                        <>
                            <div className="w-px h-8 bg-white/10" />
                            <div className="text-center">
                                <div className="text-xl font-bold text-white">{data.avg_usage_score}</div>
                                <div className="text-[10px] text-white/40 uppercase tracking-wider">avg score</div>
                            </div>
                        </>
                    )}
                    {trendDir !== 0 && (
                        <div
                            className={`flex items-center gap-1 text-xs font-medium ${trendDir > 0 ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                            <TrendingUp className={`w-3 h-3 ${trendDir < 0 ? 'rotate-180' : ''}`} />
                            {Math.abs(Math.round(trendDir))}% 7d
                        </div>
                    )}
                </div>
                <div className="text-white/40">
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
            </button>

            {/* Expanded detail */}
            {expanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-white/10 pt-3">
                    {/* Grammar weak areas */}
                    {data.grammar_weak_areas.length > 0 && (
                        <div>
                            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium mb-2">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Grammar weak areas
                            </div>
                            <div className="space-y-1.5">
                                {data.grammar_weak_areas.map((area) => (
                                    <div key={area.type} className="flex items-center gap-2">
                                        <span className="text-xs text-white/70 w-36 shrink-0">{area.label}</span>
                                        <div className="flex-1">
                                            <AccuracyBar
                                                accuracy={Math.min(100, area.count * 10)}
                                                size="sm"
                                            />
                                        </div>
                                        <span className="text-xs text-white/40 w-6 text-right">{area.count}×</span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[11px] text-white/30 mt-2">
                                Your next session will include exercises targeting these areas.
                            </p>
                        </div>
                    )}

                    {/* 7-day trend */}
                    {recentTrend.length >= 2 && (
                        <div>
                            <div className="flex items-center gap-1.5 text-xs text-white/50 font-medium mb-2">
                                <BarChart2 className="w-3.5 h-3.5" />
                                Last {recentTrend.length} days
                            </div>
                            <div className="flex items-end gap-1 h-10">
                                {recentTrend.map((pt) => {
                                    const h = Math.max(4, Math.round((pt.accuracy / 100) * 40))
                                    const color =
                                        pt.accuracy >= 80
                                            ? 'bg-emerald-500'
                                            : pt.accuracy >= 60
                                              ? 'bg-amber-500'
                                              : 'bg-red-500'
                                    return (
                                        <div
                                            key={pt.date}
                                            className="flex-1 flex flex-col items-center gap-1"
                                            title={`${pt.date}: ${pt.accuracy}% (${pt.correct}/${pt.attempts})`}
                                        >
                                            <div
                                                className={`w-full rounded-sm ${color} opacity-80`}
                                                style={{ height: `${h}px` }}
                                            />
                                            <span className="text-[9px] text-white/30">
                                                {new Date(pt.date).toLocaleDateString('en', { weekday: 'short' }).slice(0, 1)}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Exercise type breakdown */}
                    {data.exercise_type_stats.length > 0 && (
                        <div>
                            <div className="flex items-center gap-1.5 text-xs text-white/50 font-medium mb-2">
                                <Target className="w-3.5 h-3.5" />
                                By exercise type
                            </div>
                            <div className="space-y-1.5">
                                {data.exercise_type_stats
                                    .sort((a, b) => b.attempts - a.attempts)
                                    .slice(0, 6)
                                    .map((t) => (
                                        <div key={t.type} className="flex items-center gap-2">
                                            <span className="text-xs text-white/60 w-24 shrink-0">
                                                {TYPE_LABEL[t.type] ?? t.type}
                                            </span>
                                            <div className="flex-1">
                                                <AccuracyBar accuracy={t.accuracy} size="sm" />
                                            </div>
                                            <span className="text-xs text-white/40 w-12 text-right">
                                                {t.accuracy}%
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
