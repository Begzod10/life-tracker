'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import type { WeatherTheme, WeatherData } from '@/lib/hooks/use-weather'

const Weather3D = dynamic(
  () => import('./weather-3d').then(m => m.Weather3D),
  { ssr: false }
)

// ── Per-theme visual config ────────────────────────────────────────────────────

const THEMES: Record<WeatherTheme, {
  bg: string
  glow: string
  kind: 'none' | 'rain' | 'snow' | 'clouds' | 'fog' | 'sun' | 'thunder-rain'
  rainCount: number
  snowCount: number
}> = {
  clear: {
    bg: 'radial-gradient(ellipse 130% 60% at 50% -10%, rgba(251,146,60,0.38) 0%, rgba(10,10,15,0) 70%)',
    glow: 'radial-gradient(circle 400px at 50% -80px, rgba(251,191,36,0.55) 0%, transparent 65%)',
    kind: 'sun',
    rainCount: 0,
    snowCount: 0,
  },
  'partly-cloudy': {
    bg: 'radial-gradient(ellipse 130% 60% at 50% -10%, rgba(80,130,220,0.32) 0%, rgba(10,10,15,0) 70%)',
    glow: 'radial-gradient(circle 350px at 50% -60px, rgba(147,197,253,0.45) 0%, transparent 65%)',
    kind: 'clouds',
    rainCount: 0,
    snowCount: 0,
  },
  cloudy: {
    bg: 'linear-gradient(180deg, rgba(55,65,81,0.55) 0%, rgba(10,10,15,0) 60%)',
    glow: 'radial-gradient(circle 500px at 50% -100px, rgba(100,116,139,0.5) 0%, transparent 65%)',
    kind: 'clouds',
    rainCount: 0,
    snowCount: 0,
  },
  fog: {
    bg: 'linear-gradient(180deg, rgba(100,110,130,0.45) 0%, rgba(10,10,15,0) 60%)',
    glow: 'radial-gradient(circle 600px at 50% 20%, rgba(148,163,184,0.2) 0%, transparent 70%)',
    kind: 'fog',
    rainCount: 0,
    snowCount: 0,
  },
  rain: {
    bg: 'radial-gradient(ellipse 150% 70% at 50% -15%, rgba(23,37,90,0.7) 0%, rgba(10,10,15,0) 70%)',
    glow: 'radial-gradient(circle 450px at 50% -80px, rgba(59,130,246,0.45) 0%, transparent 65%)',
    kind: 'rain',
    rainCount: 120,
    snowCount: 0,
  },
  snow: {
    bg: 'radial-gradient(ellipse 150% 70% at 50% -15%, rgba(96,165,250,0.35) 0%, rgba(10,10,15,0) 70%)',
    glow: 'radial-gradient(circle 400px at 50% -70px, rgba(186,230,253,0.4) 0%, transparent 65%)',
    kind: 'snow',
    rainCount: 0,
    snowCount: 80,
  },
  thunder: {
    bg: 'radial-gradient(ellipse 150% 70% at 50% -15%, rgba(76,29,149,0.65) 0%, rgba(10,10,15,0) 70%)',
    glow: 'radial-gradient(circle 500px at 50% -90px, rgba(139,92,246,0.5) 0%, transparent 65%)',
    kind: 'thunder-rain',
    rainCount: 130,
    snowCount: 0,
  },
  unknown: {
    bg: '',
    glow: '',
    kind: 'none',
    rainCount: 0,
    snowCount: 0,
  },
}

// ── Particles ──────────────────────────────────────────────────────────────────

function useDrops(count: number) {
  return useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: (i * 127.3) % 100,
      delay: (i * 0.13) % 2.5,
      dur: 0.45 + (i % 6) * 0.12,
      len: 12 + (i % 4) * 7,
      opacity: 0.25 + (i % 5) * 0.12,
    }))
  , [count])
}

function useFlakes(count: number) {
  return useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: (i * 137.5) % 100,
      delay: (i * 0.19) % 4,
      dur: 4 + (i % 6) * 1.2,
      size: 3 + (i % 4) * 2,
      drift: (i % 2 === 0 ? 1 : -1) * (15 + (i % 3) * 10),
      opacity: 0.4 + (i % 4) * 0.15,
    }))
  , [count])
}

function RainLayer({ count, color = 'rgba(147,197,253,0.7)' }: { count: number; color?: string }) {
  const drops = useDrops(count)
  return (
    <>
      {drops.map(d => (
        <motion.div
          key={d.id}
          className="absolute top-0 rounded-full"
          style={{
            left: `${d.x}%`,
            width: `${1 + (d.id % 2)}px`,
            height: d.len + 10,
            background: `linear-gradient(180deg, transparent 0%, ${color} 100%)`,
            opacity: d.opacity + 0.2,
          }}
          animate={{ y: ['-5vh', '110vh'] }}
          transition={{ duration: d.dur, delay: d.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </>
  )
}

function SnowLayer({ count }: { count: number }) {
  const flakes = useFlakes(count)
  return (
    <>
      {flakes.map(d => (
        <motion.div
          key={d.id}
          className="absolute top-0 rounded-full bg-white"
          style={{ left: `${d.x}%`, width: d.size, height: d.size, opacity: d.opacity }}
          animate={{ y: ['-3vh', '110vh'], x: [0, d.drift] }}
          transition={{ duration: d.dur, delay: d.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </>
  )
}

function CloudLayer() {
  const clouds = useMemo(() => [
    { w: 600, h: 120, top: '3%',  dur: 40, delay: 0,    opacity: 0.18 },
    { w: 800, h: 150, top: '9%',  dur: 60, delay: -20,  opacity: 0.14 },
    { w: 500, h: 100, top: '1%',  dur: 30, delay: -10,  opacity: 0.20 },
    { w: 700, h: 130, top: '15%', dur: 75, delay: -35,  opacity: 0.12 },
    { w: 450, h: 90,  top: '7%',  dur: 28, delay: -5,   opacity: 0.16 },
  ], [])

  return (
    <>
      {clouds.map((c, i) => (
        <motion.div
          key={i}
          className="absolute blur-3xl rounded-full"
          style={{
            top: c.top,
            width: c.w,
            height: c.h,
            background: 'radial-gradient(ellipse, rgba(200,220,255,1) 0%, transparent 70%)',
            opacity: c.opacity,
          }}
          animate={{ x: ['-20%', '120%'] }}
          transition={{ duration: c.dur, delay: c.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </>
  )
}

function FogLayer() {
  return (
    <>
      {[0, 1, 2, 3, 4].map(i => (
        <motion.div
          key={i}
          className="absolute inset-x-0 blur-3xl"
          style={{
            top: `${5 + i * 8}%`,
            height: 100,
            background: 'linear-gradient(90deg, transparent 0%, rgba(180,190,210,0.22) 20%, rgba(180,190,210,0.22) 80%, transparent 100%)',
          }}
          animate={{ x: ['-8%', '8%', '-8%'] }}
          transition={{ duration: 12 + i * 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </>
  )
}

function SunLayer() {
  return (
    <>
      {/* Soft rays */}
      <motion.div
        className="absolute -top-32 left-1/2 -translate-x-1/2"
        style={{
          width: 600,
          height: 600,
          background: 'conic-gradient(from 0deg, transparent 0deg, rgba(251,191,36,0.04) 10deg, transparent 20deg, transparent 40deg, rgba(251,191,36,0.04) 50deg, transparent 60deg, transparent 80deg, rgba(251,191,36,0.04) 90deg, transparent 100deg)',
          borderRadius: '50%',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      />
      {/* Pulsing core */}
      <motion.div
        className="absolute -top-16 left-1/2 -translate-x-1/2 rounded-full"
        style={{
          width: 180,
          height: 180,
          background: 'radial-gradient(circle, rgba(251,191,36,0.22) 0%, transparent 70%)',
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </>
  )
}

function ThunderFlash() {
  return (
    <motion.div
      className="absolute inset-0"
      style={{ background: 'rgba(167,139,250,0.06)' }}
      animate={{ opacity: [0, 0, 0, 1, 0, 0.5, 0, 0, 0, 0, 0] }}
      transition={{
        duration: 7,
        repeat: Infinity,
        times: [0, 0.25, 0.26, 0.27, 0.28, 0.30, 0.31, 0.6, 0.61, 0.62, 1],
      }}
    />
  )
}

// ── Weather widget ─────────────────────────────────────────────────────────────

function weatherEmoji(theme: WeatherTheme, isDay: boolean) {
  if (theme === 'clear') return isDay ? '☀️' : '🌙'
  if (theme === 'partly-cloudy') return isDay ? '⛅' : '🌤'
  if (theme === 'cloudy') return '☁️'
  if (theme === 'fog') return '🌫️'
  if (theme === 'rain') return '🌧️'
  if (theme === 'snow') return '❄️'
  if (theme === 'thunder') return '⛈️'
  return '🌡️'
}

export function WeatherWidget({ data }: { data: WeatherData }) {
  const emoji = weatherEmoji(data.theme, data.isDay)
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 25 }}
      className="flex items-center gap-3 px-4 py-2 rounded-2xl backdrop-blur-md border border-white/10"
      style={{ background: 'rgba(255,255,255,0.06)' }}
    >
      <span className="text-2xl leading-none">{emoji}</span>
      <div className="flex flex-col">
        <div className="flex items-baseline gap-1.5">
          <span className="text-white font-semibold text-lg leading-none">{data.temperature}°</span>
          <span className="text-white/50 text-xs">feels {data.apparentTemperature}°</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-white/70 text-xs">{data.condition}</span>
          <span className="text-white/30 text-xs">·</span>
          <span className="text-white/50 text-xs truncate max-w-[100px]">{data.city}</span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main background ────────────────────────────────────────────────────────────

export function WeatherBackground({ theme }: { theme: WeatherTheme }) {
  const cfg = THEMES[theme]

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      {cfg.bg && <div className="absolute inset-0" style={{ background: cfg.bg }} />}

      {/* Top glow */}
      {cfg.glow && <div className="absolute inset-x-0 top-0 h-64" style={{ background: cfg.glow }} />}

      {/* Particle layers */}
      {(cfg.kind === 'rain' || cfg.kind === 'thunder-rain') && (
        <RainLayer count={cfg.rainCount} color={cfg.kind === 'thunder-rain' ? 'rgba(167,139,250,0.4)' : 'rgba(147,197,253,0.45)'} />
      )}
      {cfg.kind === 'snow' && <SnowLayer count={cfg.snowCount} />}
      {cfg.kind === 'clouds' && <CloudLayer />}
      {cfg.kind === 'fog' && <FogLayer />}
      {cfg.kind === 'sun' && <SunLayer />}
      {cfg.kind === 'thunder-rain' && <ThunderFlash />}

      {/* 3D layer */}
      <Weather3D theme={theme} />

      {/* Vignette to ground the content */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(10,10,15,0.6) 100%)' }}
      />
    </div>
  )
}
