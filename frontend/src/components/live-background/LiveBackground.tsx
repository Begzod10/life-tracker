'use client'

import { useEffect, useRef, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type FxEffect = 'aurora' | 'drift' | 'motes' | 'scan' | 'network' | 'rain' | 'beam'

// Sun=scan Mon=beam Tue=network Wed=drift Thu=motes Fri=rain Sat=aurora
const DAY_FX: FxEffect[] = ['scan', 'beam', 'network', 'drift', 'motes', 'rain', 'aurora']

function resolveEffect(): FxEffect {
    return DAY_FX[new Date().getDay()]
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
            <style>{`
                @keyframes lt-rain-col {
                    0%   { transform: translateY(-15%); opacity: 0; }
                    8%   { opacity: 1; }
                    92%  { opacity: 0.4; }
                    100% { transform: translateY(115%); opacity: 0; }
                }
            `}</style>
            {cols.map((col) => (
                <div key={col.id} style={{
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

// ── Effect renderer ───────────────────────────────────────────────────────────

function EffectLayer({ effect }: { effect: FxEffect }) {
    switch (effect) {
        case 'aurora':  return <Aurora />
        case 'drift':   return <Drift />
        case 'motes':   return <Motes />
        case 'scan':    return <Scan />
        case 'network': return <Network />
        case 'rain':    return <Rain />
        case 'beam':    return <Beam />
    }
}

// ── Switcher labels ───────────────────────────────────────────────────────────

// ── Main component ────────────────────────────────────────────────────────────

export function LiveBackground() {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        ensureCSS()
        setMounted(true)
    }, [])

    if (!mounted) return null

    const effect = resolveEffect()

    return (
        <div
            className="lt-livebg"
            aria-hidden
            style={{
                position: 'fixed', inset: 0, zIndex: -10,
                pointerEvents: 'none',
                background: '#070a14',
            }}
        >
            <EffectLayer effect={effect} />
        </div>
    )
}
