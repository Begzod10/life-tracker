'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type FxMode =
    | 'aurora' | 'drift' | 'motes' | 'scan' | 'network'
    | 'rain' | 'beam' | 'pulse' | 'starfield' | 'contour'
    | 'auto' | 'off'

const ALL_MODES: FxMode[] = [
    'aurora', 'drift', 'motes', 'scan', 'network',
    'rain', 'beam', 'pulse', 'starfield', 'contour',
    'auto', 'off',
]

const VALID_MODES = new Set<string>(ALL_MODES)

// Sun=scan Mon=beam Tue=network Wed=drift Thu=motes Fri=rain Sat=aurora
const DAY_FX: Exclude<FxMode, 'auto' | 'off'>[] = [
    'scan', 'beam', 'network', 'contour', 'pulse', 'rain', 'starfield',
]

const LS_KEY = 'lt_fx'

function resolveEffect(mode: FxMode): Exclude<FxMode, 'auto' | 'off'> {
    if (mode === 'auto') return DAY_FX[new Date().getDay()]
    if (mode === 'off') return 'aurora' // unreachable but TS happy
    return mode as Exclude<FxMode, 'auto' | 'off'>
}

function loadMode(): FxMode {
    try {
        const v = localStorage.getItem(LS_KEY)
        if (v && VALID_MODES.has(v)) return v as FxMode
    } catch { /* */ }
    return 'auto'
}

// ── CSS keyframes injected once ──────────────────────────────────────────────

const CSS_ID = 'lt-livebg-css'

function ensureCSS() {
    if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return
    const s = document.createElement('style')
    s.id = CSS_ID
    s.textContent = `
@keyframes lt-blob1 {
  0%,100% { transform: translate(0,0) scale(1); }
  33%  { transform: translate(6vw, 4vh) scale(1.12); }
  66%  { transform: translate(-5vw, 8vh) scale(0.92); }
}
@keyframes lt-blob2 {
  0%,100% { transform: translate(0,0) scale(1); }
  40%  { transform: translate(-8vw, -5vh) scale(1.15); }
  75%  { transform: translate(7vw, 3vh) scale(0.9); }
}
@keyframes lt-blob3 {
  0%,100% { transform: translate(0,0) scale(1); }
  25%  { transform: translate(5vw, -7vh) scale(1.08); }
  60%  { transform: translate(-4vw, 6vh) scale(1.14); }
}
@keyframes lt-drift-pan {
  0%   { background-position: 0 0; }
  100% { background-position: 64px 64px; }
}
@keyframes lt-mote-rise {
  0%   { transform: translateY(0) scale(1); opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 0.7; }
  100% { transform: translateY(-105vh) scale(0.6); opacity: 0; }
}
@keyframes lt-scan-bar {
  0%   { top: -8%; opacity: 0; }
  5%   { opacity: 1; }
  90%  { opacity: 0.7; }
  100% { top: 105%; opacity: 0; }
}
@keyframes lt-beam-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes lt-pulse-ring {
  0%   { transform: scale(0.6); opacity: 0.7; }
  100% { transform: scale(2.8); opacity: 0; }
}
@keyframes lt-star-twinkle {
  0%,100% { opacity: var(--star-base-opacity, 0.5); }
  50% { opacity: calc(var(--star-base-opacity, 0.5) * 0.3); }
}
@keyframes lt-contour-drift {
  0%   { background-position: 0 0; }
  100% { background-position: 80px 120px; }
}
@media (prefers-reduced-motion: reduce) {
  .lt-livebg * { animation: none !important; transition: none !important; }
}
`
    document.head.appendChild(s)
}

// ── Individual effects ────────────────────────────────────────────────────────

function Aurora() {
    return (
        <div className="absolute inset-0 overflow-hidden" style={{ mixBlendMode: 'screen' }}>
            <div style={{
                position: 'absolute', top: '10%', left: '15%',
                width: '55vw', height: '55vh',
                borderRadius: '50%',
                background: 'radial-gradient(ellipse, rgba(34,211,238,0.22) 0%, transparent 70%)',
                filter: 'blur(70px)',
                animation: 'lt-blob1 27s ease-in-out infinite',
            }} />
            <div style={{
                position: 'absolute', top: '30%', right: '10%',
                width: '48vw', height: '50vh',
                borderRadius: '50%',
                background: 'radial-gradient(ellipse, rgba(129,86,245,0.20) 0%, transparent 70%)',
                filter: 'blur(70px)',
                animation: 'lt-blob2 31s ease-in-out infinite',
            }} />
            <div style={{
                position: 'absolute', bottom: '15%', left: '30%',
                width: '40vw', height: '40vh',
                borderRadius: '50%',
                background: 'radial-gradient(ellipse, rgba(59,130,246,0.16) 0%, transparent 70%)',
                filter: 'blur(70px)',
                animation: 'lt-blob3 22s ease-in-out infinite',
            }} />
        </div>
    )
}

function Drift() {
    return (
        <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `
                linear-gradient(rgba(255,255,255,0.10) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.10) 1px, transparent 1px)
            `,
            backgroundSize: '64px 64px',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 100%)',
            maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 100%)',
            animation: 'lt-drift-pan 16s linear infinite',
        }} />
    )
}

function Motes() {
    const motes = Array.from({ length: 32 }, (_, i) => ({
        id: i,
        left: `${5 + (i * 31 + 7) % 88}%`,
        size: 2 + (i * 17 + 3) % 5,
        duration: 9 + (i * 7 + 1) % 13,
        delay: -((i * 4.3 + 0.5) % 21),
        violet: i % 3 === 0,
    }))
    return (
        <div className="absolute inset-0 overflow-hidden">
            {motes.map((m) => (
                <div key={m.id} style={{
                    position: 'absolute',
                    bottom: '-8px',
                    left: m.left,
                    width: m.size,
                    height: m.size,
                    borderRadius: '50%',
                    background: m.violet ? '#8b5cf6' : '#22d3ee',
                    boxShadow: `0 0 ${m.size * 3}px ${m.size}px ${m.violet ? 'rgba(139,92,246,0.5)' : 'rgba(34,211,238,0.5)'}`,
                    animation: `lt-mote-rise ${m.duration}s linear ${m.delay}s infinite`,
                }} />
            ))}
        </div>
    )
}

function Scan() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            {/* Scanlines */}
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.02) 3px, rgba(255,255,255,0.02) 4px)',
            }} />
            {/* Moving bar */}
            <div style={{
                position: 'absolute', left: 0, right: 0, height: '8%',
                background: 'linear-gradient(to bottom, transparent, rgba(34,211,238,0.08) 40%, rgba(34,211,238,0.12) 50%, rgba(34,211,238,0.08) 60%, transparent)',
                filter: 'blur(4px)',
                animation: 'lt-scan-bar 7s linear infinite',
            }} />
        </div>
    )
}

function Network() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const rafRef = useRef<number>(0)
    const activeRef = useRef(true)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        type Point = { x: number; y: number; vx: number; vy: number }
        const points: Point[] = []
        const N = 70
        const LINK_DIST = 130

        function resize() {
            if (!canvas) return
            const dpr = window.devicePixelRatio || 1
            canvas.width = canvas.offsetWidth * dpr
            canvas.height = canvas.offsetHeight * dpr
            ctx!.scale(dpr, dpr)
        }

        function init() {
            if (!canvas) return
            points.length = 0
            const w = canvas.offsetWidth, h = canvas.offsetHeight
            for (let i = 0; i < N; i++) {
                points.push({
                    x: Math.random() * w, y: Math.random() * h,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: (Math.random() - 0.5) * 0.4,
                })
            }
        }

        function draw() {
            if (!canvas || !activeRef.current) return
            const w = canvas.offsetWidth, h = canvas.offsetHeight
            ctx!.clearRect(0, 0, w, h)

            for (const p of points) {
                p.x += p.vx; p.y += p.vy
                if (p.x < 0 || p.x > w) p.vx *= -1
                if (p.y < 0 || p.y > h) p.vy *= -1
            }

            for (let i = 0; i < points.length; i++) {
                for (let j = i + 1; j < points.length; j++) {
                    const dx = points[i].x - points[j].x
                    const dy = points[i].y - points[j].y
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    if (dist < LINK_DIST) {
                        const alpha = (1 - dist / LINK_DIST) * 0.18
                        ctx!.strokeStyle = `rgba(34,211,238,${alpha})`
                        ctx!.lineWidth = 0.8
                        ctx!.beginPath()
                        ctx!.moveTo(points[i].x, points[i].y)
                        ctx!.lineTo(points[j].x, points[j].y)
                        ctx!.stroke()
                    }
                }
            }

            for (const p of points) {
                ctx!.beginPath()
                ctx!.arc(p.x, p.y, 1.5, 0, Math.PI * 2)
                ctx!.fillStyle = 'rgba(34,211,238,0.45)'
                ctx!.fill()
            }

            rafRef.current = requestAnimationFrame(draw)
        }

        const onVisibility = () => {
            activeRef.current = !document.hidden
            if (activeRef.current) rafRef.current = requestAnimationFrame(draw)
        }

        resize()
        init()
        rafRef.current = requestAnimationFrame(draw)
        window.addEventListener('resize', () => { resize(); init() })
        document.addEventListener('visibilitychange', onVisibility)

        return () => {
            cancelAnimationFrame(rafRef.current)
            activeRef.current = false
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [])

    return (
        <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
    )
}

function Rain() {
    const cols = Array.from({ length: 24 }, (_, i) => ({
        id: i,
        left: `${(i / 24) * 100}%`,
        duration: 3 + (i * 1.3 + 0.4) % 4,
        delay: -((i * 0.7 + 0.1) % 5),
        violet: i % 7 === 0,
        chars: Array.from({ length: 14 }, (_, j) =>
            ['0','1','$','¥','€','₿','∑','∆','∫','π','λ','α','β','∞'][(i + j * 3) % 14]
        ),
    }))
    return (
        <div className="absolute inset-0 overflow-hidden" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>
            {cols.map((col) => (
                <div key={col.id} style={{
                    position: 'absolute',
                    left: col.left,
                    top: '-15%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    opacity: 0.18,
                    color: col.violet ? '#a78bfa' : '#22d3ee',
                    animation: `lt-mote-rise ${col.duration}s linear ${col.delay}s infinite`,
                    animationName: 'none',
                }}>
                    {col.chars.map((c, j) => (
                        <span key={j} style={{
                            opacity: 1 - j * 0.06,
                            animation: `lt-mote-rise ${col.duration}s linear ${col.delay - j * 0.18}s infinite`,
                        }}>{c}</span>
                    ))}
                </div>
            ))}
            {/* Proper falling column animation */}
            <style>{`
                @keyframes lt-rain-col {
                    0%   { transform: translateY(-15%); opacity: 0; }
                    8%   { opacity: 1; }
                    92%  { opacity: 0.4; }
                    100% { transform: translateY(115%); opacity: 0; }
                }
            `}</style>
            {cols.map((col) => (
                <div key={`r-${col.id}`} style={{
                    position: 'absolute',
                    left: col.left,
                    top: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    color: col.violet ? '#a78bfa' : '#22d3ee',
                    opacity: 0.22,
                    animation: `lt-rain-col ${col.duration + 1}s linear ${col.delay}s infinite`,
                }}>
                    {col.chars.map((c, j) => (
                        <span key={j} style={{ opacity: 1 - j * 0.05 }}>{c}</span>
                    ))}
                </div>
            ))}
        </div>
    )
}

function Beam() {
    return (
        <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                width: '140vmax', height: '140vmax',
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(34,211,238,0.05) 20deg, rgba(129,86,245,0.07) 60deg, transparent 90deg, transparent 180deg, rgba(34,211,238,0.04) 200deg, rgba(129,86,245,0.06) 240deg, transparent 270deg)',
                WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 10%, transparent 70%)',
                maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 10%, transparent 70%)',
                animation: 'lt-beam-spin 40s linear infinite',
            }} />
        </div>
    )
}

// ── 3 new effects ─────────────────────────────────────────────────────────────
// pulse  — expanding radar rings from center; focused, meditative (good for Sun or Thu)
// starfield — slow parallax star dots; calm, vast (good for Sat)
// contour — slow drifting topographic lines; flowing, analytical (good for Wed or Fri)

function Pulse() {
    const rings = [0, 1, 2, 3]
    return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Crosshair */}
            <div style={{
                position: 'absolute',
                width: '100%', height: '1px',
                background: 'linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.06) 40%, rgba(34,211,238,0.12) 50%, rgba(34,211,238,0.06) 60%, transparent)',
            }} />
            <div style={{
                position: 'absolute',
                width: '1px', height: '100%',
                background: 'linear-gradient(180deg, transparent 0%, rgba(34,211,238,0.06) 40%, rgba(34,211,238,0.12) 50%, rgba(34,211,238,0.06) 60%, transparent)',
            }} />
            {/* Center dot */}
            <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#22d3ee', zIndex: 1,
                boxShadow: '0 0 12px 4px rgba(34,211,238,0.5)',
            }} />
            {/* Expanding rings */}
            {rings.map((i) => (
                <div key={i} style={{
                    position: 'absolute',
                    width: '60vmin', height: '60vmin',
                    borderRadius: '50%',
                    border: '1px solid rgba(34,211,238,0.25)',
                    animation: `lt-pulse-ring 4s ease-out ${i * 1}s infinite`,
                }} />
            ))}
        </div>
    )
}

function Starfield() {
    const stars = Array.from({ length: 120 }, (_, i) => ({
        id: i,
        left: `${(i * 67 + 13) % 100}%`,
        top: `${(i * 43 + 7) % 100}%`,
        size: 1 + (i % 3) * 0.5,
        baseOpacity: 0.2 + (i % 5) * 0.08,
        delay: `${(i * 0.37) % 6}s`,
        duration: `${4 + (i % 5)}s`,
        violet: i % 11 === 0,
    }))
    return (
        <div className="absolute inset-0 overflow-hidden">
            {stars.map((s) => (
                <div key={s.id} style={{
                    position: 'absolute',
                    left: s.left, top: s.top,
                    width: s.size, height: s.size,
                    borderRadius: '50%',
                    background: s.violet ? '#c4b5fd' : '#e0f7ff',
                    '--star-base-opacity': s.baseOpacity,
                    opacity: s.baseOpacity,
                    boxShadow: s.size > 1.5 ? `0 0 ${s.size * 2}px rgba(255,255,255,0.4)` : 'none',
                    animation: `lt-star-twinkle ${s.duration} ease-in-out ${s.delay} infinite`,
                } as React.CSSProperties} />
            ))}
        </div>
    )
}

function Contour() {
    return (
        <div style={{
            position: 'absolute', inset: 0, overflow: 'hidden',
        }}>
            {/* Two offset SVG-like gradient layers creating contour illusion */}
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: `
                    repeating-radial-gradient(
                        ellipse 80% 60% at 50% 45%,
                        transparent 0px, transparent 38px,
                        rgba(34,211,238,0.045) 39px, rgba(34,211,238,0.045) 40px,
                        transparent 41px, transparent 79px,
                        rgba(129,86,245,0.035) 80px, rgba(129,86,245,0.035) 81px
                    )
                `,
                animation: 'lt-contour-drift 28s linear infinite',
            }} />
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: `
                    repeating-radial-gradient(
                        ellipse 65% 80% at 55% 55%,
                        transparent 0px, transparent 58px,
                        rgba(34,211,238,0.03) 59px, rgba(34,211,238,0.03) 60px,
                        transparent 61px, transparent 119px,
                        rgba(34,211,238,0.025) 120px, rgba(34,211,238,0.025) 121px
                    )
                `,
                animation: 'lt-contour-drift 36s linear reverse infinite',
            }} />
            <div style={{
                position: 'absolute', inset: 0,
                WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 50%, black 20%, transparent 85%)',
                maskImage: 'radial-gradient(ellipse 90% 80% at 50% 50%, black 20%, transparent 85%)',
            }} />
        </div>
    )
}

// ── Effect renderer ───────────────────────────────────────────────────────────

function EffectLayer({ effect }: { effect: Exclude<FxMode, 'auto' | 'off'> }) {
    switch (effect) {
        case 'aurora':    return <Aurora />
        case 'drift':     return <Drift />
        case 'motes':     return <Motes />
        case 'scan':      return <Scan />
        case 'network':   return <Network />
        case 'rain':      return <Rain />
        case 'beam':      return <Beam />
        case 'pulse':     return <Pulse />
        case 'starfield': return <Starfield />
        case 'contour':   return <Contour />
    }
}

// ── Switcher labels ───────────────────────────────────────────────────────────

const LABELS: Record<FxMode, string> = {
    aurora: 'Aurora', drift: 'Drift', motes: 'Motes', scan: 'Scan',
    network: 'Network', rain: 'Rain', beam: 'Beam',
    pulse: 'Pulse', starfield: 'Stars', contour: 'Contour',
    auto: 'Auto', off: 'Off',
}

const SWITCHER_ORDER: FxMode[] = [
    'auto', 'off', 'aurora', 'drift', 'motes', 'scan',
    'network', 'rain', 'beam', 'pulse', 'starfield', 'contour',
]

// ── Main component ────────────────────────────────────────────────────────────

export function LiveBackground() {
    const [mode, setMode] = useState<FxMode>('auto')
    const [open, setOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]

    useEffect(() => {
        ensureCSS()
        setMode(loadMode())
        setMounted(true)
    }, [])

    const choose = useCallback((m: FxMode) => {
        setMode(m)
        setOpen(false)
        try { localStorage.setItem(LS_KEY, m) } catch { /* */ }
    }, [])

    if (!mounted) return null

    const activeEffect = mode === 'off' ? null : resolveEffect(mode)
    const activeLabel = mode === 'auto' ? `Auto · ${dayName}` : LABELS[mode]

    const pill: React.CSSProperties = {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        padding: '4px 10px',
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.2s, color 0.2s',
        whiteSpace: 'nowrap',
    }

    return (
        <>
            {/* Background layer */}
            <div
                className="lt-livebg"
                aria-hidden
                style={{
                    position: 'fixed', inset: 0, zIndex: -10,
                    pointerEvents: 'none',
                    transition: 'opacity 0.7s ease',
                    opacity: mode === 'off' ? 0 : 1,
                }}
            >
                {activeEffect && <EffectLayer effect={activeEffect} />}
            </div>

            {/* Switcher — collapsed pill + expanded tray */}
            <div style={{
                position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                zIndex: 9990, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
                {/* Expanded tray */}
                {open && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center',
                        maxWidth: '90vw',
                        background: 'rgba(7,10,20,0.90)', backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 16, padding: '6px 8px',
                        boxShadow: '0 4px 32px rgba(0,0,0,0.6)',
                    }}>
                        {SWITCHER_ORDER.map((m) => {
                            const active = m === mode
                            const label = m === 'auto' ? `Auto · ${dayName}` : LABELS[m]
                            return (
                                <button
                                    key={m}
                                    onClick={() => choose(m)}
                                    style={{
                                        ...pill,
                                        background: active
                                            ? 'linear-gradient(135deg, #22d3ee, #6366f1)'
                                            : 'transparent',
                                        color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                                    }}
                                >
                                    {label}
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* Collapsed pill — always visible */}
                <button
                    onClick={() => setOpen((v) => !v)}
                    style={{
                        ...pill,
                        padding: '5px 14px',
                        background: 'linear-gradient(135deg, #22d3ee, #6366f1)',
                        color: '#fff',
                        boxShadow: '0 2px 16px rgba(34,211,238,0.25)',
                    }}
                >
                    {activeLabel}
                </button>
            </div>
        </>
    )
}
