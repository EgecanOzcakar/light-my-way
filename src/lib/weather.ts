import type { Checkpoint } from '../types'

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'

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
  return best
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
    `&hourly=temperature_2m,precipitation&timezone=UTC&forecast_days=3`

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
    const block = blocks[i] ?? blocks[0]
    if (!block?.hourly?.time?.length) return cp
    const h = nearestHourIndex(block.hourly.time, cp.etaISO)
    const tempC = block.hourly.temperature_2m[h]
    const precipMm = block.hourly.precipitation[h]
    if (tempC == null || precipMm == null) return cp
    return { ...cp, weather: { tempC, precipMm, icon: weatherIcon(precipMm) } }
  })
}
