import type { Checkpoint, RouteResult, Settings } from '../types'
import { geocode as realGeocode, type GeoHit } from './geocode'
import { getRoute as realGetRoute } from './routing'
import { attachWeather as realAttachWeather } from './weather'
import { sampleCheckpoints } from './schedule'
import { hazardsFor, HAZARD_THRESHOLDS } from './hazard'
import { can, isMultiDay, PlanError, type Plan } from './entitlements'

export type Warning = 'routing-approximate' | 'weather-unavailable'

export class GeocodeError extends Error {
  constructor(public field: 'from' | 'to', query: string) {
    super(`Could not find a location for "${query}"`)
    this.name = 'GeocodeError'
  }
}

/** Score a checkpoint's weather with the hazard model (user's ice threshold applied). */
export function withHazards(c: Checkpoint, settings: Settings): Checkpoint {
  const hazards = c.weather
    ? hazardsFor(c.weather, { ...HAZARD_THRESHOLDS, iceC: settings.iceThresholdC })
    : []
  return { ...c, hazards, hazard: hazards.length > 0 }
}

export interface CalculateInput {
  from: string
  to: string
  intervalMin: number
  startISO?: string
  /** Enforce plan limits; omitted → no gating (tests, internal callers). */
  plan?: Plan
}

export interface TripResult {
  route: RouteResult
  checkpoints: Checkpoint[]
  warnings: Warning[]
}

export interface CalculateDeps {
  geocode: (query: string) => Promise<GeoHit | null>
  getRoute: (from: GeoHit['coord'], to: GeoHit['coord'], baseUrl: string) => Promise<RouteResult>
  attachWeather: (checkpoints: Checkpoint[]) => Promise<Checkpoint[]>
}

const defaultDeps: CalculateDeps = {
  geocode: (q) => realGeocode(q),
  getRoute: (from, to, baseUrl) => realGetRoute(from, to, baseUrl),
  attachWeather: (cps) => realAttachWeather(cps),
}

export async function calculateTrip(
  input: CalculateInput,
  settings: Settings,
  deps: Partial<CalculateDeps> = {},
): Promise<TripResult> {
  const { geocode, getRoute, attachWeather } = { ...defaultDeps, ...deps }

  const [origin, destination] = await Promise.all([geocode(input.from), geocode(input.to)])
  if (!origin) throw new GeocodeError('from', input.from)
  if (!destination) throw new GeocodeError('to', input.to)

  const route = await getRoute(origin.coord, destination.coord, settings.routingBaseUrl)

  const sampled = sampleCheckpoints(route, {
    startISO: input.startISO ?? new Date().toISOString(),
    intervalMin: input.intervalMin,
    originLabel: origin.label,
    destinationLabel: destination.label,
  })

  if (input.plan && !can(input.plan, 'multi-day') && isMultiDay(sampled)) throw new PlanError('multi-day')

  const weathered = await attachWeather(sampled)
  const checkpoints = weathered.map((c) => withHazards(c, settings))

  const warnings: Warning[] = []
  if (route.approximate) warnings.push('routing-approximate')
  if (checkpoints.some((c) => !c.weather)) warnings.push('weather-unavailable')

  return { route, checkpoints, warnings }
}
