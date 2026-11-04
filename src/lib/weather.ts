import type { Checkpoint, CheckpointWeather } from '../types'
import { API_BASE, WEATHER_URL } from './config'
import { throwIfProRequired, type Feature } from './entitlements'

export function weatherIcon(precipMm: number, snowCm = 0): string {
  if (snowCm > 0) return '❄️'
  return precipMm > 0 ? '🌧️' : '☀️'
}

export interface HourlyBlock {
  hourly: {
    time: string[]
    temperature_2m: number[]
    precipitation: number[]
    snowfall?: number[]
    wind_gusts_10m?: number[]
    visibility?: number[]
  }
}

const HOURLY_FIELDS = 'temperature_2m,precipitation,snowfall,wind_gusts_10m,visibility'
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MAX_FORECAST_DAYS = 16 // Open-Meteo forecast API limit
const MAX_HOUR_GAP_MS = 90 * 60_000

const hourISO = (ms: number): string => new Date(ms).toISOString().slice(0, 16)

/**
 * The UTC hour range (Open-Meteo `start_hour`/`end_hour`) covering firstMs..lastMs,
 * clamped to today 00:00 … the 16-day API limit. Null when nothing is forecastable.
 * Sending the real end (not forecast_days) lets the proxy enforce the free 24 h horizon.
 */
export function forecastWindow(
  firstMs: number,
  lastMs: number,
  nowMs: number = Date.now(),
): { start_hour: string; end_hour: string } | null {
  const today = Math.floor(nowMs / DAY_MS) * DAY_MS
  const start = Math.max(today, Math.floor(firstMs / HOUR_MS) * HOUR_MS)
  const end = Math.min(today + MAX_FORECAST_DAYS * DAY_MS - HOUR_MS, Math.ceil(lastMs / HOUR_MS) * HOUR_MS)
  return start <= end ? { start_hour: hourISO(start), end_hour: hourISO(end) } : null
}

const etaMs = (c: Checkpoint): number => new Date(c.etaISO).getTime()

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

/** The weather in `block` at `iso`, or undefined if that hour isn't covered. */
export function weatherAt(block: HourlyBlock | undefined, iso: string): CheckpointWeather | undefined {
  const hourly = block?.hourly
  if (!hourly?.time?.length) return undefined
  const h = nearestHourIndex(hourly.time, iso)
  if (h < 0) return undefined
  const tempC = hourly.temperature_2m[h]
  const precipMm = hourly.precipitation[h]
  if (tempC == null || precipMm == null) return undefined
  const snowCm = hourly.snowfall?.[h] ?? undefined
  return {
    tempC,
    precipMm,
    snowCm,
    gustKmh: hourly.wind_gusts_10m?.[h] ?? undefined,
    visibilityM: hourly.visibility?.[h] ?? undefined,
    icon: weatherIcon(precipMm, snowCm),
  }
}

/**
 * Hourly forecast blocks, one per checkpoint location (index-aligned), for the
 * window firstMs..lastMs, in a single request. [] when the window is outside the
 * forecast; null on failure. Throws PlanError when the proxy answers `pro_required`.
 */
export async function fetchHourly(
  checkpoints: Checkpoint[],
  firstMs: number,
  lastMs: number,
  fetchFn: typeof fetch = fetch,
  feature?: Feature,
): Promise<HourlyBlock[] | null> {
  const window = forecastWindow(firstMs, lastMs)
  if (!window) return []
  const lat = checkpoints.map((c) => c.coord.lat.toFixed(4)).join(',')
  const lng = checkpoints.map((c) => c.coord.lng.toFixed(4)).join(',')
  const url =
    `${WEATHER_URL}?latitude=${lat}&longitude=${lng}` +
    `&hourly=${HOURLY_FIELDS}&timezone=UTC&start_hour=${window.start_hour}&end_hour=${window.end_hour}` +
    // only the proxy knows this flag; never sent to public Open-Meteo
    (feature && API_BASE ? `&feature=${feature}` : '')
  let res: Response
  try {
    res = await fetchFn(url)
  } catch {
    return null
  }
  await throwIfProRequired(res)
  if (!res.ok) return null
  try {
    const data = (await res.json()) as HourlyBlock | HourlyBlock[]
    return Array.isArray(data) ? data : [data]
  } catch {
    return null
  }
}

/**
 * Fill in each checkpoint's weather from Open-Meteo. On any failure the
 * checkpoints are returned untouched so the schedule still renders.
 */
export async function attachWeather(
  checkpoints: Checkpoint[],
  fetchFn: typeof fetch = fetch,
): Promise<Checkpoint[]> {
  if (checkpoints.length === 0) return checkpoints
  const blocks = await fetchHourly(
    checkpoints,
    Math.min(...checkpoints.map(etaMs)),
    Math.max(...checkpoints.map(etaMs)),
    fetchFn,
  )
  if (!blocks) return checkpoints
  return checkpoints.map((cp, i) => {
    // no fallback to another checkpoint's location: missing stays missing
    const weather = weatherAt(blocks[i], cp.etaISO)
    return weather ? { ...cp, weather } : cp
  })
}
