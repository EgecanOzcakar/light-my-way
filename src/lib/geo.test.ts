import { describe, it, expect } from 'vitest'
import { haversineM, cumulativeDistancesM, interpolateAlong } from './geo'

const NY = { lat: 40.7128, lng: -74.006 }
const LA = { lat: 34.0522, lng: -118.2437 }

describe('haversineM', () => {
  it('NY->LA is ~3936 km', () => {
    expect(haversineM(NY, LA) / 1000).toBeCloseTo(3936, -2)
  })
  it('zero for identical points', () => expect(haversineM(NY, NY)).toBe(0))
})

describe('cumulativeDistancesM', () => {
  it('starts at 0 and increases', () => {
    const pts = [NY, { lat: 41, lng: -74 }, { lat: 42, lng: -74 }]
    const c = cumulativeDistancesM(pts)
    expect(c[0]).toBe(0)
    expect(c).toHaveLength(3)
    expect(c[2]).toBeGreaterThan(c[1])
  })
})

describe('interpolateAlong', () => {
  it('returns a point near the midpoint distance', () => {
    const pts = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
    ]
    const c = cumulativeDistancesM(pts)
    const mid = interpolateAlong(pts, c, c[1] / 2)
    expect(mid.lng).toBeCloseTo(5, 1)
    expect(mid.lat).toBeCloseTo(0, 5)
  })
  it('clamps past the end', () => {
    const pts = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
    ]
    const c = cumulativeDistancesM(pts)
    expect(interpolateAlong(pts, c, 1e9)).toEqual(pts[1])
  })
  it('clamps before the start', () => {
    const pts = [
      { lat: 1, lng: 1 },
      { lat: 0, lng: 10 },
    ]
    expect(interpolateAlong(pts, cumulativeDistancesM(pts), -5)).toEqual(pts[0])
  })
})
