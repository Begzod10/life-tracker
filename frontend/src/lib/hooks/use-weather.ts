'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type WeatherTheme =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'thunder'
  | 'unknown'

export interface DailyForecast {
  date: string // ISO yyyy-mm-dd
  code: number
  theme: WeatherTheme
  tempMax: number
  tempMin: number
  condition: string
}

export interface WeatherData {
  temperature: number
  apparentTemperature: number
  code: number
  theme: WeatherTheme
  city: string // '' when reverse-geocoding failed — NEVER fatal
  condition: string
  isDay: boolean
  forecast: DailyForecast[] // up to 5 days; [] if the daily block is missing
}

export type WeatherStatus = 'idle' | 'locating' | 'loading' | 'success' | 'error'

export type WeatherErrorKind = 'unsupported' | 'denied' | 'position' | 'weather'

export interface WeatherError {
  kind: WeatherErrorKind
  message: string
}

/* ------------------------------------------------------------------ */
/*  WMO code decoding (exported so components can reuse it)            */
/* ------------------------------------------------------------------ */

export function codeToTheme(code: number): WeatherTheme {
  if (code === 0) return 'clear'
  if (code === 1 || code === 2) return 'partly-cloudy'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'thunder'
  return 'unknown'
}

export function codeToCondition(code: number): string {
  switch (code) {
    case 0:
      return 'Clear sky'
    case 1:
      return 'Mainly clear'
    case 2:
      return 'Partly cloudy'
    case 3:
      return 'Overcast'
    case 45:
    case 48:
      return 'Fog'
    case 51:
    case 53:
    case 55:
      return 'Drizzle'
    case 56:
    case 57:
      return 'Freezing drizzle'
    case 61:
    case 63:
    case 65:
      return 'Rain'
    case 66:
    case 67:
      return 'Freezing rain'
    case 71:
    case 73:
    case 75:
      return 'Snow'
    case 77:
      return 'Snow grains'
    case 80:
    case 81:
    case 82:
      return 'Rain showers'
    case 85:
    case 86:
      return 'Snow showers'
    case 95:
      return 'Thunderstorm'
    case 96:
    case 99:
      return 'Thunderstorm with hail'
    default:
      return 'Unknown'
  }
}

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const CACHE_KEY = 'weather_cache'
const CACHE_TTL = 30 * 60 * 1000 // 30 min — fresh cache skips network AND the prompt

const GEO_OPTS: PositionOptions = {
  enableHighAccuracy: false, // city-level forecast; saves battery and dodges slow GPS
  timeout: 8000, // without this getCurrentPosition can hang indefinitely
  maximumAge: 10 * 60 * 1000, // reuse a recent fix instead of re-querying hardware
}

interface CacheShape {
  data: WeatherData
  timestamp: number
  lat: number
  lon: number
}

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

// Fresh = within TTL. Read before geolocation so cached mounts never re-prompt.
function readFreshCache(): WeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as CacheShape
    return Date.now() - c.timestamp < CACHE_TTL ? c.data : null
  } catch {
    localStorage.removeItem(CACHE_KEY) // corrupt payload → wipe and refetch
    return null
  }
}

// Any cached payload, TTL ignored — the warm-UI fallback when a refresh fails offline.
function readStaleCache(): WeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as CacheShape).data : null
  } catch {
    return null
  }
}

function writeCache(data: WeatherData, lat: number, lon: number) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data, timestamp: Date.now(), lat, lon } satisfies CacheShape),
    )
  } catch {
    /* quota exceeded / private mode — non-fatal */
  }
}

/* ------------------------------------------------------------------ */
/*  Network                                                            */
/* ------------------------------------------------------------------ */

// Current conditions + a 5-day daily block in a SINGLE request.
async function fetchWeather(lat: number, lon: number, signal: AbortSignal) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&forecast_days=5&timezone=auto`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`open-meteo ${res.status}`)
  return res.json()
}

// Reverse geocoding is OPTIONAL and isolated. BigDataCloud is used because it is
// built for unauthenticated in-browser reverse geocoding (no key, no custom
// User-Agent required, permissive CORS) — unlike Nominatim, whose usage policy
// expects a User-Agent the browser cannot set. Swap providers by editing only this
// function; nothing else cares where the city string comes from.
// NOTE: verify BigDataCloud's current free-tier terms before shipping.
async function fetchCity(lat: number, lon: number, signal: AbortSignal): Promise<string> {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${lat}&longitude=${lon}&localityLanguage=en`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`geocode ${res.status}`)
  const j = await res.json()
  return j.city || j.locality || j.principalSubdivision || ''
}

function parseWeather(raw: any, city: string): WeatherData {
  const c = raw.current
  const code = Math.round(c.weather_code)
  const d = raw.daily

  const forecast: DailyForecast[] = Array.isArray(d?.time)
    ? d.time.map((date: string, i: number) => {
        const dc = Math.round(d.weather_code[i])
        return {
          date,
          code: dc,
          theme: codeToTheme(dc),
          tempMax: Math.round(d.temperature_2m_max[i]),
          tempMin: Math.round(d.temperature_2m_min[i]),
          condition: codeToCondition(dc),
        }
      })
    : []

  return {
    temperature: Math.round(c.temperature_2m),
    apparentTemperature: Math.round(c.apparent_temperature),
    code,
    theme: codeToTheme(code),
    city,
    condition: codeToCondition(code),
    isDay: c.is_day === 1,
    forecast,
  }
}

/* ------------------------------------------------------------------ */
/*  Geolocation (promisified, with typed errors)                       */
/* ------------------------------------------------------------------ */

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject({ kind: 'unsupported', message: 'Geolocation not supported' } as WeatherError)
      return
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) =>
        reject({
          kind: err.code === err.PERMISSION_DENIED ? 'denied' : 'position',
          message:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied'
              : 'Could not determine your location',
        } as WeatherError),
      GEO_OPTS,
    )
  })
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useWeather() {
  const [data, setData] = useState<WeatherData | null>(null)
  const [status, setStatus] = useState<WeatherStatus>('idle')
  const [error, setError] = useState<WeatherError | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort() // cancel any in-flight run (e.g. rapid refresh)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setError(null)

    // 1. Fresh cache → serve immediately, no prompt, no network.
    const fresh = readFreshCache()
    if (fresh) {
      setData(fresh)
      setStatus('success')
      return
    }

    // 2. Locate.
    setStatus('locating')
    let pos: GeolocationPosition
    try {
      pos = await getPosition()
    } catch (e) {
      const stale = readStaleCache() // denied/offline but we have something → stay warm
      if (stale) {
        setData(stale)
        setStatus('success')
      } else {
        setError(e as WeatherError)
        setStatus('error')
      }
      return
    }

    const { latitude: lat, longitude: lon } = pos.coords

    // 3. Fetch. Weather is required; city is best-effort and CANNOT null the result.
    setStatus('loading')
    try {
      const [weatherRes, cityRes] = await Promise.allSettled([
        fetchWeather(lat, lon, ctrl.signal),
        fetchCity(lat, lon, ctrl.signal),
      ])

      if (weatherRes.status === 'rejected') throw weatherRes.reason

      const city = cityRes.status === 'fulfilled' ? cityRes.value : ''
      const parsed = parseWeather(weatherRes.value, city)
      setData(parsed)
      writeCache(parsed, lat, lon)
      setStatus('success')
    } catch (e) {
      if (ctrl.signal.aborted) return // superseded by a newer run — ignore
      const stale = readStaleCache()
      if (stale) {
        setData(stale)
        setStatus('success')
      } else {
        setError({ kind: 'weather', message: 'Failed to fetch weather' })
        setStatus('error')
      }
    }
  }, [])

  useEffect(() => {
    load()
    return () => abortRef.current?.abort()
  }, [load])

  return {
    data,
    theme: data?.theme ?? 'unknown',
    status,
    error,
    refresh: load, // manual retry for an error/refresh button in the chip
  } as const
}
