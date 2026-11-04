import { describe, it, expect } from 'vitest'
import { toJSON, toCSV, toICS, icsEscape, icsFold } from './export'
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

describe('ICS RFC 5545 formatting', () => {
  const utf8 = new TextEncoder()

  it('escapes backslash, semicolon, comma and newlines in TEXT', () => {
    expect(icsEscape('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\;c\\,d\\ne\\nf')
    const ics = toICS(checkpoints)
    expect(ics).toContain('SUMMARY:Times Square\\, NY')
  })

  it('folds lines at 75 octets without splitting UTF-8 sequences', () => {
    const long = 'SUMMARY:' + 'é'.repeat(60) + '⚠'.repeat(20)
    const folded = icsFold(long)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(utf8.encode(p).length).toBeLessThanOrEqual(75)
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true)
    // unfolding restores the original exactly
    expect(folded.replace(/\r\n /g, '')).toBe(long)
    expect(icsFold('SHORT')).toBe('SHORT')
  })

  it('uses CRLF everywhere and includes DTSTAMP on every event', () => {
    const ics = toICS(checkpoints, new Date('2026-09-01T08:00:00.000Z'))
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(ics.match(/DTSTAMP:20260901T080000Z/g)).toHaveLength(2)
  })
})
