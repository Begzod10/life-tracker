'use client'

import { useState, useEffect } from 'react'

export type WeatherTheme = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'thunder' | 'unknown'

export interface WeatherData {
  temperature: number
  apparentTemperature: number
  code: number
  theme: WeatherTheme
  city: string
  condition: string
  isDay: boolean
}

function codeToTheme(code: number): WeatherTheme {
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly-cloudy'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain'
  if (code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'thunder'
  return 'unknown'
}

function codeToCondition(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code === 1) return 'Mainly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Foggy'
  if (code >= 51 && code <= 55) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rainy'
  if (code >= 71 && code <= 77) return 'Snowy'
  if (code >= 80 && code <= 82) return 'Rain showers'
  if (code === 85 || code === 86) return 'Snow showers'
  if (code >= 95) return 'Thunderstorm'
  return 'Unknown'
}

const CACHE_KEY = 'weather_cache'
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

export function useWeather() {
  const [data, setData] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false)
      return
    }

    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_TTL) {
          setData(cachedData)
          setLoading(false)
          return
        }
      }
    } catch {
      try { localStorage.removeItem(CACHE_KEY) } catch {}
    }

    if (!navigator.geolocation) {
      setError('Geolocation not supported')
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords

          const [weatherRes, geoRes] = await Promise.all([
            fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weathercode,is_day&timezone=auto`
            ),
            fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
            ),
          ])

          const [weather, geo] = await Promise.all([weatherRes.json(), geoRes.json()])

          const current = weather.current
          const addr = geo.address || {}
          const city = addr.city || addr.town || addr.village || addr.county || 'Your city'

          const result: WeatherData = {
            temperature: Math.round(current.temperature_2m),
            apparentTemperature: Math.round(current.apparent_temperature),
            code: current.weathercode,
            theme: codeToTheme(current.weathercode),
            condition: codeToCondition(current.weathercode),
            city,
            isDay: current.is_day === 1,
          }

          setData(result)
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: result, timestamp: Date.now() }))
        } catch (err) {
          setError('Failed to fetch weather')
        } finally {
          setLoading(false)
        }
      },
      () => {
        setError('Location denied')
        setLoading(false)
      }
    )
  }, [])

  return { data, loading, error }
}
