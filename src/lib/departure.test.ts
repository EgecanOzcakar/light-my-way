import { describe, it, expect, vi } from 'vitest'
import { scoreDepartures, bestDeparture } from './departure'
import type { Checkpoint, Settings } from '../types'

const settings = { iceThresholdC: 0 } as Settings
const now = Date.parse('2026-09-08T12:00:00Z')

const cp = (id: string, etaISO: string): Checkpoint => ({
  id,
  label: id,
  coord: { lat: 40, lng: -74 },
  etaISO,
  offsetMin: 0,
  cumulativeKm: 0,
  kind: 'interval',
  hazard: false,
})

// Freezing rain 12:00–14:00, clear from 15:00.
const block = {
  hourly: {
    time: Array.from({ length: 24 }, (_, h) => `2026-09-08T${String(h).padStart(2, '0')}:00`),
    temperature_2m: Array.from({ length: 24 }, (_, h) => (h < 15 ? -2 : 3)),
    precipitation: Array.from({ length: 24 }, () => 0.5),
  },
}

describe('scoreDepartures', () => {
  it('scores each hourly departure with the hazard model and picks the safest', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => [block, block] }) as unknown as typeof fetch
    // a 1 h trip planned for some other day: only relative timing matters
    const trip = [cp('a', '2026-01-01T00:00:00Z'), cp('b', '2026-01-01T01:00:00Z')]
    const opts = (await scoreDepartures(trip, settings, { hours: 4, nowMs: now, fetchFn: f }))!
    expect(opts.map((o) => o.hazardCount)).toEqual([2, 2, 1, 0, 0])
    expect(opts[0].kinds).toEqual(['ice'])
    expect(bestDeparture(opts)!.departISO).toBe('2026-09-08T15:00:00.000Z')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('returns null when weather is unavailable', async () => {
    const f = vi.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch
    expect(await scoreDepartures([cp('a', '2026-09-08T12:00:00Z')], settings, { fetchFn: f })).toBeNull()
  })
})
