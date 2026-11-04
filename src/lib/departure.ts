import type { Checkpoint, HazardKind, Settings } from '../types'
import { fetchHourly, weatherAt } from './weather'
import { withHazards } from './calculate'

export interface DepartureOption {
  departISO: string
  /** Hazardous checkpoints if leaving at this time (lower is better). */
  hazardCount: number
  kinds: HazardKind[]
  /** False when some checkpoint had no forecast for this departure. */
  complete: boolean
}

export interface ScoreOptions {
  hours?: number
  stepMin?: number
  nowMs?: number
  fetchFn?: typeof fetch
}

/**
 * Re-time an already-sampled trip to each departure in the next `hours` and
 * score it with the hazard model. One weather request covers every option, since
 * checkpoint locations don't change — only their ETAs. Throws PlanError if the
 * proxy refuses it (free plan).
 */
export async function scoreDepartures(
  checkpoints: Checkpoint[],
  settings: Settings,
  { hours = 12, stepMin = 60, nowMs = Date.now(), fetchFn = fetch }: ScoreOptions = {},
): Promise<DepartureOption[] | null> {
  if (checkpoints.length === 0) return []
  const t0 = new Date(checkpoints[0].etaISO).getTime()
  const tripMs = new Date(checkpoints[checkpoints.length - 1].etaISO).getTime() - t0
  const lastMs = nowMs + hours * 3600_000 + tripMs
  const blocks = await fetchHourly(checkpoints, nowMs, lastMs, fetchFn, 'best-time')
  if (!blocks) return null

  const options: DepartureOption[] = []
  for (let m = 0; m <= hours * 60; m += stepMin) {
    const shift = nowMs + m * 60_000 - t0
    let hazardCount = 0
    let complete = true
    const kinds = new Set<HazardKind>()
    checkpoints.forEach((c, i) => {
      const etaISO = new Date(new Date(c.etaISO).getTime() + shift).toISOString()
      const weather = weatherAt(blocks[i], etaISO)
      if (!weather) complete = false
      const scored = withHazards({ ...c, etaISO, weather }, settings)
      if (scored.hazard) hazardCount++
      scored.hazards?.forEach((k) => kinds.add(k))
    })
    options.push({ departISO: new Date(nowMs + m * 60_000).toISOString(), hazardCount, kinds: [...kinds], complete })
  }
  return options
}

/** Fewest hazards among fully-forecast options; earliest wins ties. */
export function bestDeparture(options: DepartureOption[]): DepartureOption | undefined {
  return options
    .filter((o) => o.complete)
    .reduce<DepartureOption | undefined>((best, o) => (!best || o.hazardCount < best.hazardCount ? o : best), undefined)
}
