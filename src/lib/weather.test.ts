import { describe, it, expect, vi } from 'vitest'
import { attachWeather, weatherIcon } from './weather'
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
})
