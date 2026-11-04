import { describe, it, expect } from 'vitest'
import { hazardsFor, HAZARD_THRESHOLDS } from './hazard'

const w = (o: Partial<Parameters<typeof hazardsFor>[0]> = {}) => ({ tempC: 10, precipMm: 0, icon: '', ...o })

describe('hazardsFor', () => {
  it('safe weather has no hazards', () => expect(hazardsFor(w())).toEqual([]))
  it('ice: at/below 0 °C with precipitation', () => {
    expect(hazardsFor(w({ tempC: 0, precipMm: 0.2 }))).toContain('ice')
    expect(hazardsFor(w({ tempC: -3, precipMm: 0 }))).not.toContain('ice')
    expect(hazardsFor(w({ tempC: 1, precipMm: 1 }))).not.toContain('ice')
  })
  it('no longer flags the old cold-and-wet ≤25 °C rule', () =>
    expect(hazardsFor(w({ tempC: 20, precipMm: 0.5 }))).toEqual([]))
  it('snow, wind, fog and heavy rain', () => {
    expect(hazardsFor(w({ snowCm: 0.4 }))).toEqual(['snow'])
    expect(hazardsFor(w({ gustKmh: 60 }))).toEqual(['wind'])
    expect(hazardsFor(w({ visibilityM: 300 }))).toEqual(['fog'])
    expect(hazardsFor(w({ precipMm: 6 }))).toEqual(['heavy-rain'])
  })
  it('respects custom thresholds', () =>
    expect(hazardsFor(w({ tempC: 2, precipMm: 1 }), { ...HAZARD_THRESHOLDS, iceC: 2 })).toEqual(['ice']))
})
