import { describe, it, expect, vi, beforeEach } from 'vitest'
import { geocode, _clearGeocodeCache } from './geocode'

beforeEach(() => {
  localStorage.clear()
  _clearGeocodeCache()
})

describe('geocode', () => {
  it('parses the first result and caches it', async () => {
    const f = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ display_name: 'Paris, France', lat: '48.8566', lon: '2.3522' }],
    }) as unknown as typeof fetch

    const a = await geocode('paris', f)
    expect(a).toEqual({ label: 'Paris, France', coord: { lat: 48.8566, lng: 2.3522 } })

    await geocode('  Paris  ', f)
    expect(f).toHaveBeenCalledTimes(1) // normalised cache hit
  })

  it('returns null on no match', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch
    expect(await geocode('zzzznowhere', f)).toBeNull()
  })

  it('returns null on HTTP error', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch
    expect(await geocode('paris', f)).toBeNull()
  })
})
