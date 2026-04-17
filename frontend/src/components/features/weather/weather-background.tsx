'use client'

import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import type { WeatherTheme, WeatherData } from '@/lib/hooks/use-weather'

// ── Theme configs ──────────────────────────────────────────────────────────────

const THEME_CONFIG: Record<WeatherTheme, {
  gradient: string
  accent: string
  particleColor: string
  particleCount: number
  kind: 'none' | 'rain' | 'snow' | 'stars' | 'clouds' | 'fog'
}> = {
  clear: {
    gradient: 'radial-gradient(ellipse 80% 40% at 50% -10%, rgba(251,146,60,0.18) 0%, rgba(10,10,15,0) 100%)',
    accent: 'rgba(251,191,36,0.6)',
    particleColor: 'rgba(251,191,36,0.6)',
    particleCount: 0,
    kind: 'stars',
  },
  'partly-cloudy': {
    gradient: 'radial-gradient(ellipse 80% 40% at 50% -10%, rgba(99,155,210,0.14) 0%, rgba(10,10,15,0) 100%)',
    accent: 'rgba(147,197,253,0.4)',
    particleColor: 'rgba(200,220,255,0.5)',
    particleCount: 3,
    kind: 'clouds',
  },
  cloudy: {
    gradient: 'linear-gradient(180deg, rgba(55,65,81,0.25) 0%, rgba(10,10,15,0) 60%)',
    accent: 'rgba(156,163,175,0.3)',
    particleColor: 'rgba(200,210,230,0.4)',
    particleCount: 5,
    kind: 'clouds',
  },
  fog: {
    gradient: 'linear-gradient(180deg, rgba(75,85,99,0.2) 0%, rgba(10,10,15,0) 60%)',
    accent: 'rgba(156,163,175,0.2)',
    particleColor: 'rgba(180,190,210,0.15)',
    particleCount: 0,
    kind: 'fog',
  },
  rain: {
    gradient: 'radial-gradient(ellipse 80% 50% at 50% -5%, rgba(30,58,138,0.28) 0%, rgba(10,10,15,0) 100%)',
    accent: 'rgba(59,130,246,0.5)',
    particleColor: 'rgba(147,197,253,0.5)',
    particleCount: 60,
    kind: 'rain',
  },
  snow: {
    gradient: 'radial-gradient(ellipse 80% 50% at 50% -5%, rgba(96,165,250,0.2) 0%, rgba(10,10,15,0) 100%)',
    accent: 'rgba(186,230,253,0.5)',
    particleColor: 'rgba(219,234,254,0.8)',
    particleCount: 40,
    kind: 'snow',
  },
  thunder: {
    gradient: 'radial-gradient(ellipse 80% 50% at 50% -5%, rgba(88,28,135,0.25) 0%, rgba(10,10,15,0) 100%)',
    accent: 'rgba(167,139,250,0.5)',
    particleColor: 'rgba(147,197,253,0.5)',
    particleCount: 30,
    kind: 'rain',
  },
  unknown: {
    gradient: 'none',
    accent: 'transparent',
    particleColor: 'transparent',
    particleCount: 0,
    kind: 'none',
  },
}

// ── Weather icon ───────────────────────────────────────────────────────────────

function weatherEmoji(theme: WeatherTheme, isDay: boolean): string {
  if (theme === 'clear') return isDay ? '☀️' : '🌙'
  if (theme === 'partly-cloudy') return isDay ? '⛅' : '🌤'
  if (theme === 'cloudy') return '☁️'
  if (theme === 'fog') return '🌫️'
  if (theme === 'rain') return '🌧️'
  if (theme === 'snow') return '❄️'
  if (theme === 'thunder') return '⛈️'
  return '🌡️'
}

// ── Particle helpers ───────────────────────────────────────────────────────────

function useParticles(count: number, seed = 0) {
  return useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: ((i * 137.5 + seed) % 100),
      delay: (i * 0.17) % 3,
      duration: 0.6 + (i % 5) * 0.2,
      size: 1 + (i % 3) * 0.5,
      opacity: 0.3 + (i % 4) * 0.15,
    }))
  }, [count, seed])
}

// ── Particle renderers ─────────────────────────────────────────────────────────

function RainParticles({ color, count }: { color: string; count: number }) {
  const drops = useParticles(count)
  return (
    <>
      {drops.map(d => (
        <motion.div
          key={d.id}
          className="absolute top-0 w-px rounded-full"
          style={{
            left: `${d.x}%`,
            height: `${10 + d.size * 6}px`,
            background: color,
            opacity: d.opacity,
          }}
          animate={{ y: ['0vh', '110vh'] }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </>
  )
}

function SnowParticles({ color, count }: { color: string; count: number }) {
  const flakes = useParticles(count)
  return (
    <>
      {flakes.map(d => (
        <motion.div
          key={d.id}
          className="absolute top-0 rounded-full"
          style={{
            left: `${d.x}%`,
            width: `${3 + d.size * 2}px`,
            height: `${3 + d.size * 2}px`,
            background: color,
            opacity: d.opacity,
          }}
          animate={{
            y: ['0vh', '110vh'],
            x: [0, (d.id % 2 === 0 ? 1 : -1) * 20],
          }}
          transition={{
            duration: 3 + d.duration * 2,
            delay: d.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </>
  )
}

function CloudParticles({ color, count }: { color: string; count: number }) {
  const clouds = useParticles(count)
  return (
    <>
      {clouds.map(d => (
        <motion.div
          key={d.id}
          className="absolute rounded-full blur-3xl"
          style={{
            top: `${5 + (d.id % 3) * 8}%`,
            width: `${180 + d.id * 60}px`,
            height: `${60 + d.id * 20}px`,
            background: color,
            opacity: d.opacity * 0.6,
          }}
          animate={{ x: ['-10%', '110%'] }}
          transition={{
            duration: 25 + d.id * 8,
            delay: d.delay * 5,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </>
  )
}

function FogLayer({ color }: { color: string }) {
  return (
    <>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute inset-x-0 h-32 blur-3xl"
          style={{
            top: `${10 + i * 12}%`,
            background: `linear-gradient(90deg, transparent 0%, ${color} 30%, ${color} 70%, transparent 100%)`,
          }}
          animate={{ x: ['-5%', '5%', '-5%'] }}
          transition={{
            duration: 10 + i * 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </>
  )
}

function SunGlow() {
  return (
    <motion.div
      className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: 400, height: 400 }}
    >
      <motion.div
        className="w-full h-full rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(251,191,36,0.12) 0%, transparent 70%)',
        }}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  )
}

function ThunderFlash() {
  return (
    <motion.div
      className="absolute inset-0 bg-purple-400/5"
      animate={{ opacity: [0, 0, 0, 0.15, 0, 0.08, 0, 0, 0, 0] }}
      transition={{ duration: 8, repeat: Infinity, times: [0, 0.3, 0.31, 0.32, 0.33, 0.35, 0.36, 0.7, 0.71, 1] }}
    />
  )
}

// ── Weather widget ─────────────────────────────────────────────────────────────

export function WeatherWidget({ data }: { data: WeatherData }) {
  const emoji = weatherEmoji(data.theme, data.isDay)
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm text-sm text-white/80"
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="font-medium">{data.temperature}°C</span>
      <span className="text-white/40">·</span>
      <span className="text-white/60 truncate max-w-[120px]">{data.city}</span>
    </motion.div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function WeatherBackground({ theme }: { theme: WeatherTheme }) {
  const cfg = THEME_CONFIG[theme]

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{ background: cfg.gradient }} />

      {/* Particles */}
      {cfg.kind === 'rain' && <RainParticles color={cfg.particleColor} count={cfg.particleCount} />}
      {cfg.kind === 'snow' && <SnowParticles color={cfg.particleColor} count={cfg.particleCount} />}
      {cfg.kind === 'clouds' && <CloudParticles color={cfg.particleColor} count={cfg.particleCount} />}
      {cfg.kind === 'fog' && <FogLayer color={cfg.accent} />}
      {cfg.kind === 'stars' && <SunGlow />}
      {theme === 'thunder' && <ThunderFlash />}
    </div>
  )
}
