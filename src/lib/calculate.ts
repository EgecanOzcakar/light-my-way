import type { Checkpoint, RouteResult, Settings } from '../types'
import { geocode as realGeocode, type GeoHit } from './geocode'
import { getRoute as realGetRoute } from './routing'
import { attachWeather as realAttachWeather } from './weather'
import { sampleCheckpoints } from './schedule'
import { isHazardous } from './hazard'

export type Warning = 'routing-approximate' | 'weather-unavailable'

export class GeocodeError extends Error {
  constructor(public field: 'from' | 'to', query: string) {
    super(`Could not find a location for "${query}"`)
    this.name = 'GeocodeError'
  }
}

export interface CalculateInput {
  from: string
  to: string
  intervalMin: number
  startISO?: string
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

  const weathered = await attachWeather(sampled)
  const checkpoints = weathered.map((c) => ({
    ...c,
    hazard: c.weather
      ? isHazardous(c.weather.tempC, c.weather.precipMm, settings.hazardThresholdC)
      : false,
  }))

  const warnings: Warning[] = []
  if (route.approximate) warnings.push('routing-approximate')
  if (checkpoints.some((c) => !c.weather)) warnings.push('weather-unavailable')

  return { route, checkpoints, warnings }
}
