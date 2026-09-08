import type { LatLng } from '../types'

const EARTH_RADIUS_M = 6_371_000

const toRad = (deg: number): number => (deg * Math.PI) / 180

/** Great-circle distance between two points, in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Running distance from the first point to each point. `[0, ...]`, same length as input. */
export function cumulativeDistancesM(points: LatLng[]): number[] {
  const out: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1] + haversineM(points[i - 1], points[i]))
  }
  return out
}

/**
 * Point at `targetM` metres along the polyline, linearly interpolated between
 * the two bracketing vertices. Clamps to the endpoints when out of range.
 */
export function interpolateAlong(points: LatLng[], cumM: number[], targetM: number): LatLng {
  if (points.length === 0) throw new Error('interpolateAlong: empty polyline')
  if (targetM <= 0) return points[0]
  const total = cumM[cumM.length - 1]
  if (targetM >= total) return points[points.length - 1]

  let i = 1
  while (i < cumM.length && cumM[i] < targetM) i++
  const segStart = cumM[i - 1]
  const segLen = cumM[i] - segStart || 1
  const t = (targetM - segStart) / segLen
  return {
    lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
    lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t,
  }
}
