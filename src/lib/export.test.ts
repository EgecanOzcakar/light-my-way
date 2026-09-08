import { describe, it, expect } from 'vitest'
import { toJSON, toCSV, toICS } from './export'
import type { Checkpoint, RouteResult } from '../types'

const route: RouteResult = { polyline: [], distanceM: 2150, durationS: 480, approximate: false }

const checkpoints: Checkpoint[] = [
  {
    id: 'cp-0',
    label: 'Times Square, NY',
    coord: { lat: 40.7, lng: -74 },
    etaISO: '2026-09-08T12:00:00.000Z',
    offsetMin: 0,
    cumulativeKm: 0,
    kind: 'origin',
    hazard: false,
  },
  {
    id: 'cp-1',
    label: 'Midtown',
    coord: { lat: 40.75, lng: -73.99 },
    etaISO: '2026-09-08T12:05:00.000Z',
    offsetMin: 5,
    cumulativeKm: 1.2,
    kind: 'interval',
    weather: { tempC: 4, precipMm: 1.1, icon: '🌧️' },
    hazard: true,
  },
]

describe('export', () => {
  it('JSON round-trips', () => {
    const parsed = JSON.parse(toJSON(checkpoints, route))
    expect(parsed.checkpoints).toHaveLength(2)
    expect(parsed.distanceM).toBe(2150)
  })

  it('CSV has the header and a hazard row', () => {
    const csv = toCSV(checkpoints).split('\n')
    expect(csv[0]).toBe('time,label,kind,tempC,precipMm,hazard')
    expect(csv[2]).toContain('true')
    expect(csv[1]).toContain('"Times Square, NY"') // comma quoted
  })

  it('ICS is a valid calendar with one VEVENT per checkpoint', () => {
    const ics = toICS(checkpoints)
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('DTSTART:20260908T120000Z')
    expect(ics).toContain('SUMMARY:⚠ Midtown')
  })
})
