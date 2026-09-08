import type { LatLng, RouteResult } from '../types'
import { haversineM } from './geo'

/**
 * FOSSGIS community OSRM instance — same API as the project demo server
 * (router.project-osrm.org) but with far better uptime. Overridable in Settings.
 */
export const DEFAULT_ROUTING_BASE_URL = 'https://routing.openstreetmap.de/routed-car'

const FALLBACK_AVG_KMH = 70
const FALLBACK_POINTS = 64

/** Straight-line route used when a routing provider is unreachable. */
export function greatCircleRoute(from: LatLng, to: LatLng, avgKmh = FALLBACK_AVG_KMH): RouteResult {
  const polyline: LatLng[] = []
  for (let i = 0; i <= FALLBACK_POINTS; i++) {
    const t = i / FALLBACK_POINTS
    polyline.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
    })
  }
  const distanceM = haversineM(from, to)
  return {
    polyline,
    distanceM,
    durationS: (distanceM / 1000 / avgKmh) * 3600,
    approximate: true,
  }
}

/** Query an OSRM server. Throws on any non-ok response or missing route. */
export async function osrmRoute(
  from: LatLng,
  to: LatLng,
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<RouteResult> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`
  const url = `${baseUrl.replace(/\/$/, '')}/route/v1/driving/${coords}?overview=full&geometries=geojson`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`routing HTTP ${res.status}`)
  const data = (await res.json()) as {
    routes?: Array<{ distance: number; duration: number; geometry: { coordinates: [number, number][] } }>
  }
  const route = data.routes?.[0]
  if (!route) throw new Error('routing: no route in response')
  return {
    polyline: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    distanceM: route.distance,
    durationS: route.duration,
    approximate: false,
  }
}

/** Get a route, degrading to a straight-line path if the provider fails. */
export async function getRoute(
  from: LatLng,
  to: LatLng,
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<RouteResult> {
  try {
    return await osrmRoute(from, to, baseUrl, fetchFn)
  } catch {
    return greatCircleRoute(from, to)
  }
}
