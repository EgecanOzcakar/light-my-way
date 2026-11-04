import type { Checkpoint } from '../types'

const OPEN_METEO = import.meta.env.VITE_WEATHER_URL || 'https://api.open-meteo.com/v1/forecast'

export function weatherIcon(precipMm: number): string {
  return precipMm > 0 ? '🌧️' : '☀️'
}

interface HourlyBlock {
  hourly: {
    time: string[]
    temperature_2m: number[]
    precipitation: number[]
  }
}

const DAY_MS = 86_400_000
const MAX_FORECAST_DAYS = 16 // Open-Meteo forecast API limit
const MAX_HOUR_GAP_MS = 90 * 60_000

/** forecast_days covering today (UTC) through the last checkpoint's ETA, capped at the API max. */
export function forecastDays(checkpoints: Checkpoint[], nowMs: number = Date.now()): number {
  const lastMs = Math.max(...checkpoints.map((c) => new Date(c.etaISO).getTime()))
  const days = Math.floor(lastMs / DAY_MS) - Math.floor(nowMs / DAY_MS) + 1
  return Math.min(MAX_FORECAST_DAYS, Math.max(1, days))
}

/** Index of the hour nearest to `targetISO`, or -1 if none is within 90 min (outside the forecast). */
const nearestHourIndex = (times: string[], targetISO: string): number => {
  const target = new Date(targetISO).getTime()
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < times.length; i++) {
    // Open-Meteo hourly times are naive UTC ("2026-09-08T12:00") with timezone=UTC
    const diff = Math.abs(new Date(times[i] + 'Z').getTime() - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return bestDiff <= MAX_HOUR_GAP_MS ? best : -1
}

/**
 * Fill in each checkpoint's weather from Open-Meteo in a single request (one
 * location per checkpoint, comma-joined). On any failure the checkpoints are
 * returned untouched so the schedule still renders.
 */
export async function attachWeather(
  checkpoints: Checkpoint[],
  fetchFn: typeof fetch = fetch,
): Promise<Checkpoint[]> {
  if (checkpoints.length === 0) return checkpoints

  const lat = checkpoints.map((c) => c.coord.lat.toFixed(4)).join(',')
  const lng = checkpoints.map((c) => c.coord.lng.toFixed(4)).join(',')
  const url =
    `${OPEN_METEO}?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,precipitation&timezone=UTC&forecast_days=${forecastDays(checkpoints)}`

  let blocks: HourlyBlock[]
  try {
    const res = await fetchFn(url)
    if (!res.ok) return checkpoints
    const data = (await res.json()) as HourlyBlock | HourlyBlock[]
    blocks = Array.isArray(data) ? data : [data]
  } catch {
    return checkpoints
  }

  return checkpoints.map((cp, i) => {
    const block = blocks[i] // no fallback to another checkpoint's location: missing stays missing
    if (!block?.hourly?.time?.length) return cp
    const h = nearestHourIndex(block.hourly.time, cp.etaISO)
    if (h < 0) return cp
    const tempC = block.hourly.temperature_2m[h]
    const precipMm = block.hourly.precipitation[h]
    if (tempC == null || precipMm == null) return cp
    return { ...cp, weather: { tempC, precipMm, icon: weatherIcon(precipMm) } }
  })
}
