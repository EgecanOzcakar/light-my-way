import { describe, it, expect, vi } from 'vitest'
import { calculateTrip, GeocodeError } from './calculate'
import type { RouteResult, Settings } from '../types'

const settings: Settings = {
  hazardThresholdC: 25,
  routingBaseUrl: 'https://routing.test',
  units: 'metric',
  theme: 'dark',
}

const straightRoute = (approximate: boolean): RouteResult => ({
  polyline: [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
  ],
  distanceM: 111_000,
  durationS: 3600,
  approximate,
})

type Hit = { label: string; coord: { lat: number; lng: number } } | null

const deps = () => ({
  geocode: vi.fn<(q: string) => Promise<Hit>>(async (q: string) => ({
    label: q.toUpperCase(),
    coord: { lat: 0, lng: q === 'A' ? 0 : 1 },
  })),
  getRoute: vi.fn(async () => straightRoute(false)),
  attachWeather: vi.fn(async (cps: any[]) =>
    cps.map((c) => ({ ...c, weather: { tempC: 3, precipMm: 1, icon: '🌧️' } })),
  ),
})

describe('calculateTrip', () => {
  it('applies the hazard rule to weathered checkpoints', async () => {
    const d = deps()
    const r = await calculateTrip(
      { from: 'A', to: 'B', intervalMin: 30, startISO: '2026-09-08T12:00:00.000Z' },
      settings,
      d,
    )
    expect(r.checkpoints.every((c) => c.hazard)).toBe(true)
    expect(r.warnings).not.toContain('routing-approximate')
    expect(r.warnings).not.toContain('weather-unavailable')
  })

  it('warns when routing is approximate', async () => {
    const d = deps()
    d.getRoute.mockResolvedValue(straightRoute(true))
    const r = await calculateTrip({ from: 'A', to: 'B', intervalMin: 30 }, settings, d)
    expect(r.warnings).toContain('routing-approximate')
  })

  it('warns when any checkpoint has no weather', async () => {
    const d = deps()
    d.attachWeather.mockImplementation(async (cps: any[]) => cps)
    const r = await calculateTrip({ from: 'A', to: 'B', intervalMin: 30 }, settings, d)
    expect(r.warnings).toContain('weather-unavailable')
    expect(r.checkpoints.every((c) => c.hazard === false)).toBe(true)
  })

  it('throws GeocodeError naming the failed field', async () => {
    const d = deps()
    d.geocode.mockImplementation(async (q: string) =>
      q === 'B' ? null : { label: q, coord: { lat: 0, lng: 0 } },
    )
    await expect(calculateTrip({ from: 'A', to: 'B', intervalMin: 30 }, settings, d)).rejects.toMatchObject(
      { field: 'to' },
    )
    await expect(
      calculateTrip({ from: 'A', to: 'B', intervalMin: 30 }, settings, d),
    ).rejects.toBeInstanceOf(GeocodeError)
  })
})
