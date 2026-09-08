import { describe, it, expect } from 'vitest'
import { sampleCheckpoints } from './schedule'
import type { RouteResult } from '../types'

const route: RouteResult = {
  polyline: [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
  ],
  distanceM: 111_000,
  durationS: 3600,
  approximate: false,
}

const opts = {
  startISO: '2026-09-08T12:00:00.000Z',
  intervalMin: 30,
  originLabel: 'A',
  destinationLabel: 'B',
}

describe('sampleCheckpoints', () => {
  const cps = sampleCheckpoints(route, opts)

  it('brackets with origin and destination', () => {
    expect(cps[0].kind).toBe('origin')
    expect(cps.at(-1)!.kind).toBe('destination')
    expect(cps[0].label).toBe('A')
    expect(cps.at(-1)!.label).toBe('B')
  })

  it('has a 30-min interval checkpoint for a 60-min trip', () => {
    expect(cps.some((c) => c.kind === 'interval' && c.offsetMin === 30)).toBe(true)
  })

  it('origin cumulativeKm is 0, destination ~111', () => {
    expect(cps[0].cumulativeKm).toBe(0)
    expect(cps.at(-1)!.cumulativeKm).toBeCloseTo(111, 0)
  })

  it('etaISO advances with offset', () => {
    const mid = cps.find((c) => c.offsetMin === 30)!
    expect(mid.etaISO).toBe('2026-09-08T12:30:00.000Z')
    expect(cps.at(-1)!.etaISO).toBe('2026-09-08T13:00:00.000Z')
  })

  it('every checkpoint has a stable unique id and hazard defaults false', () => {
    const ids = cps.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(cps.every((c) => c.hazard === false && c.weather === undefined)).toBe(true)
  })

  it('no interval points when the interval exceeds the duration', () => {
    expect(sampleCheckpoints(route, { ...opts, intervalMin: 120 })).toHaveLength(2)
  })
})
