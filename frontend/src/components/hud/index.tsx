'use client'

import { cn } from '@/lib/utils'

// ── Eyebrow ──────────────────────────────────────────────────────────────────
// Mono uppercase kicker above section titles
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <span className={cn('mono-label text-cyan-400/60', className)}>
            {children}
        </span>
    )
}

// ── StatusBar ─────────────────────────────────────────────────────────────────
// Top of every module page: brand tile + section label + right-side chips
interface StatusBarProps {
    section: string
    chips?: { label: string; active?: boolean }[]
    className?: string
}

export function StatusBar({ section, chips, className }: StatusBarProps) {
    return (
        <div className={cn('flex items-center justify-between gap-4 mb-6 sm:mb-8', className)}>
            {/* Left: brand mark + section label */}
            <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0" />
                <div>
                    <p className="mono-label text-cyan-400/50">// {section.toUpperCase()}</p>
                </div>
            </div>

            {/* Right: status chips */}
            {chips && chips.length > 0 && (
                <div className="flex items-center gap-2">
                    {chips.map((chip) => (
                        <span
                            key={chip.label}
                            className={cn(
                                'mono-label px-2 py-0.5 rounded border text-[10px]',
                                chip.active
                                    ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10'
                                    : 'text-white/30 border-white/10 bg-white/[0.03]'
                            )}
                        >
                            {chip.active && (
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 mr-1.5 align-middle shadow-[0_0_4px_2px_rgba(34,211,238,0.6)]" />
                            )}
                            {chip.label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── HCard ─────────────────────────────────────────────────────────────────────
// Corner-bracket glass card (CSS class .hcard handles the pseudo-elements)
interface HCardProps {
    children: React.ReactNode
    className?: string
    rounded?: string
}

export function HCard({ children, className, rounded = 'rounded-xl' }: HCardProps) {
    return (
        <div className={cn('hcard', rounded, 'p-4', className)}>
            {children}
        </div>
    )
}

// ── MetricTile ────────────────────────────────────────────────────────────────
// mono label → big tabular number → mono sub/delta
interface MetricTileProps {
    label: string
    value: string | number
    sub?: string
    delta?: string
    deltaPositive?: boolean
    accent?: string
    className?: string
}

export function MetricTile({ label, value, sub, delta, deltaPositive, accent = '#22d3ee', className }: MetricTileProps) {
    return (
        <div className={cn('hcard rounded-xl p-4 flex flex-col gap-1', className)}>
            <p className="mono-label text-white/40">{label}</p>
            <p
                className="tabular text-2xl font-bold leading-none mt-1"
                style={{ color: accent }}
            >
                {value}
            </p>
            {(sub || delta) && (
                <div className="flex items-center gap-2 mt-1">
                    {sub && <span className="mono-label text-white/30">{sub}</span>}
                    {delta && (
                        <span className={cn('mono-label text-[10px]', deltaPositive ? 'text-emerald-400' : 'text-rose-400')}>
                            {delta}
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}

// ── SegmentedProgress ─────────────────────────────────────────────────────────
// Thin segmented bar — fills with cyan gradient
interface SegmentedProgressProps {
    segments: number
    filled: number
    className?: string
}

export function SegmentedProgress({ segments, filled, className }: SegmentedProgressProps) {
    return (
        <div className={cn('flex gap-1', className)} role="progressbar" aria-valuenow={filled} aria-valuemax={segments}>
            {Array.from({ length: segments }, (_, i) => (
                <div
                    key={i}
                    className="flex-1 h-1 rounded-full transition-all duration-300"
                    style={{
                        background: i < filled
                            ? 'linear-gradient(90deg,#22d3ee,#6366f1)'
                            : 'rgba(255,255,255,0.08)',
                    }}
                />
            ))}
        </div>
    )
}

// ── CommandGrid ───────────────────────────────────────────────────────────────
// Faint 64px grid background, radially masked — wrap pages with this
export function CommandGrid({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn('relative', className)} {...rest}>
            <div className="cmd-grid pointer-events-none absolute inset-0 z-0" aria-hidden />
            <div className="relative z-10">{children}</div>
        </div>
    )
}
