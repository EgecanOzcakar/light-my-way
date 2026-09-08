import { describe, it, expect, vi } from 'vitest'
import { greatCircleRoute, getRoute } from './routing'

const A = { lat: 40.7, lng: -74.0 }
const B = { lat: 40.8, lng: -73.9 }

describe('greatCircleRoute', () => {
  it('is marked approximate with real endpoints and positive metrics', () => {
    const r = greatCircleRoute(A, B)
    expect(r.approximate).toBe(true)
    expect(r.polyline[0]).toEqual(A)
    expect(r.polyline.at(-1)).toEqual(B)
    expect(r.polyline.length).toBeGreaterThan(2)
    expect(r.distanceM).toBeGreaterThan(0)
    expect(r.durationS).toBeGreaterThan(0)
  })
})

describe('getRoute', () => {
  it('falls back to great-circle when OSRM responds not-ok', async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch
    const r = await getRoute(A, B, 'https://example.invalid', failing)
    expect(r.approximate).toBe(true)
  })

  it('falls back to great-circle when fetch throws', async () => {
    const throwing = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch
    const r = await getRoute(A, B, 'https://example.invalid', throwing)
    expect(r.approximate).toBe(true)
  })

  it('uses OSRM geometry on success', async () => {
    const ok = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          {
            distance: 1234,
            duration: 90,
            geometry: {
              coordinates: [
                [-74, 40.7],
                [-73.9, 40.8],
              ],
            },
          },
        ],
      }),
    }) as unknown as typeof fetch
    const r = await getRoute(A, B, 'https://ok', ok)
    expect(r.approximate).toBe(false)
    expect(r.distanceM).toBe(1234)
    expect(r.durationS).toBe(90)
    expect(r.polyline).toEqual([
      { lat: 40.7, lng: -74 },
      { lat: 40.8, lng: -73.9 },
    ])
  })
})
