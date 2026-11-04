import { fixture, haversineKm, upstreamJSON } from '../util.js'

/** Decode a Valhalla polyline6 string to [lng, lat] pairs. */
export function decodePolyline6(str) {
  const out = []
  let i = 0
  let lat = 0
  let lng = 0
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0
      let result = 0
      let b
      do {
        b = str.charCodeAt(i++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += delta
      else lng += delta
    }
    out.push([lng / 1e6, lat / 1e6])
  }
  return out
}

/** Truck dimensions from env (metres / metric tonnes). */
export function truckOptions(env) {
  const n = (v, d) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d)
  return {
    height: n(env.TRUCK_HEIGHT_M, 4.0),
    width: n(env.TRUCK_WIDTH_M, 2.55),
    length: n(env.TRUCK_LENGTH_M, 16.5),
    weight: n(env.TRUCK_WEIGHT_T, 40),
    axle_load: n(env.TRUCK_AXLE_LOAD_T, 11.5),
  }
}

/**
 * Routing adapter → OSRM response shape ({ routes: [{ distance, duration, geometry }] }).
 * Real: Valhalla (Stadia-hosted style) with truck costing. Mock: a synthetic
 * road-like path from fixtures/route.json parameters.
 */
export function createRouter(env, fetchFn) {
  const key = env.ROUTER_API_KEY
  const base = env.ROUTER_URL || 'https://api.stadiamaps.com/route/v1'
  const truck = truckOptions(env)
  const mock = key ? null : fixture('route.json')

  return async function route(from, to) {
    if (mock) {
      const km = haversineKm(from, to) * mock.detourFactor
      const coordinates = []
      for (let i = 0; i <= mock.points; i++) {
        const t = i / mock.points
        const wiggle = Math.sin(t * Math.PI * 3) * mock.wiggleDeg * Math.sin(t * Math.PI)
        coordinates.push([from.lng + (to.lng - from.lng) * t + wiggle, from.lat + (to.lat - from.lat) * t - wiggle])
      }
      return {
        mock: true,
        body: {
          code: 'Ok',
          routes: [{ distance: km * 1000, duration: (km / mock.avgTruckKmh) * 3600, geometry: { coordinates } }],
        },
      }
    }

    const data = await upstreamJSON(fetchFn, `${base}?api_key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        locations: [
          { lat: from.lat, lon: from.lng },
          { lat: to.lat, lon: to.lng },
        ],
        costing: 'truck',
        costing_options: { truck },
        units: 'kilometers',
        directions_type: 'none',
      }),
    })
    const trip = data.trip
    if (!trip) return { mock: false, body: { code: 'NoRoute', routes: [] } }
    return {
      mock: false,
      body: {
        code: 'Ok',
        routes: [
          {
            distance: trip.summary.length * 1000,
            duration: trip.summary.time,
            geometry: { coordinates: trip.legs.flatMap((l) => decodePolyline6(l.shape)) },
          },
        ],
      },
    }
  }
}
