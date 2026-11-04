import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { attachWeather, forecastWindow, weatherIcon } from './weather'
import { PlanError } from './entitlements'

// The forecast window is clamped to "today", so pin today to the fixture date.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-08T06:00:00Z'))
})
afterEach(() => vi.useRealTimers())
import type { Checkpoint } from '../types'

const cp = (id: string, etaISO: string): Checkpoint => ({
  id,
  label: id,
  coord: { lat: 40 + Number(id.at(-1)), lng: -74 },
  etaISO,
  offsetMin: 0,
  cumulativeKm: 0,
  kind: 'interval',
  hazard: false,
})

const hourlyBlock = (base: string) => ({
  hourly: {
    time: [`${base}T11:00`, `${base}T12:00`, `${base}T13:00`],
    temperature_2m: [10, 4, 3],
    precipitation: [0, 0.5, 1.2],
  },
})

describe('weatherIcon', () => {
  it('rain when wet, sun when dry', () => {
    expect(weatherIcon(0)).toBe('☀️')
    expect(weatherIcon(0.1)).toBe('🌧️')
  })
})

describe('attachWeather', () => {
  it('picks the nearest hour per checkpoint', async () => {
    const f = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [hourlyBlock('2026-09-08'), hourlyBlock('2026-09-08')],
    }) as unknown as typeof fetch

    const out = await attachWeather(
      [cp('cp1', '2026-09-08T12:05:00Z'), cp('cp2', '2026-09-08T12:55:00Z')],
      f,
    )
    expect(out[0].weather).toMatchObject({ tempC: 4, precipMm: 0.5 })
    expect(out[1].weather).toMatchObject({ tempC: 3, precipMm: 1.2 })
  })

  it('leaves weather undefined when the request fails', async () => {
    const f = vi.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch
    const out = await attachWeather([cp('cp1', '2026-09-08T12:00:00Z')], f)
    expect(out[0].weather).toBeUndefined()
  })

  it('marks checkpoints without their own block as missing (no blocks[0] fallback)', async () => {
    const f = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [hourlyBlock('2026-09-08')],
    }) as unknown as typeof fetch
    const out = await attachWeather(
      [cp('cp1', '2026-09-08T12:00:00Z'), cp('cp2', '2026-09-08T12:00:00Z')],
      f,
    )
    expect(out[0].weather).toBeDefined()
    expect(out[1].weather).toBeUndefined()
  })

  it('marks an ETA outside the returned hours as missing', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => hourlyBlock('2026-09-08') }) as unknown as typeof fetch
    const out = await attachWeather([cp('cp1', '2026-09-09T12:00:00Z')], f)
    expect(out[0].weather).toBeUndefined()
  })
})

describe('forecastWindow', () => {
  const now = Date.parse('2026-09-08T22:00:00Z')
  it('covers first..last ETA on whole UTC hours', () => {
    expect(forecastWindow(Date.parse('2026-09-08T22:10:00Z'), Date.parse('2026-09-09T01:20:00Z'), now)).toEqual({
      start_hour: '2026-09-08T22:00',
      end_hour: '2026-09-09T02:00',
    })
  })
  it('clamps to today and the 16-day limit; null when entirely outside', () => {
    expect(forecastWindow(Date.parse('2026-09-07T10:00:00Z'), Date.parse('2026-12-01T00:00:00Z'), now)).toEqual({
      start_hour: '2026-09-08T00:00',
      end_hour: '2026-09-23T23:00',
    })
    expect(forecastWindow(Date.parse('2026-12-01T00:00:00Z'), Date.parse('2026-12-02T00:00:00Z'), now)).toBeNull()
  })
})

describe('pro_required from the proxy', () => {
  it('surfaces as PlanError instead of "weather unavailable"', async () => {
    const f = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'pro_required', feature: 'multi-day' }),
    }) as unknown as typeof fetch
    await expect(attachWeather([cp('cp1', '2026-09-08T12:00:00Z')], f)).rejects.toMatchObject({
      name: 'PlanError',
      feature: 'multi-day',
    })
    await expect(attachWeather([cp('cp1', '2026-09-08T12:00:00Z')], f)).rejects.toBeInstanceOf(PlanError)
  })

  it('sends start_hour/end_hour instead of forecast_days', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch
    await attachWeather([cp('cp1', '2026-09-08T12:05:00Z'), cp('cp2', '2026-09-08T14:30:00Z')], f)
    const url = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
    expect(url).toContain('start_hour=2026-09-08T12:00&end_hour=2026-09-08T15:00')
    expect(url).not.toContain('forecast_days')
  })
})
