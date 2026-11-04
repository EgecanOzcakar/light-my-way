import { fixture, upstreamJSON } from '../util.js'

/**
 * Geocoder adapter → Nominatim jsonv2 rows ({ display_name, lat, lon }), the
 * format the frontend already parses. Real: Geoapify. Mock: fixtures/geocode.json.
 */
export function createGeocoder(env, fetchFn) {
  const key = env.GEOAPIFY_API_KEY
  const base = env.GEOAPIFY_URL || 'https://api.geoapify.com/v1/geocode/search'
  const places = key ? [] : fixture('geocode.json').places

  return async function search(q, limit) {
    if (!key) {
      const needle = q.trim().toLowerCase()
      const rows = places
        .filter((p) => needle && p.name.toLowerCase().includes(needle))
        .slice(0, limit)
        .map((p) => ({ display_name: `[mock] ${p.name}`, lat: String(p.lat), lon: String(p.lon) }))
      return { mock: true, body: rows }
    }
    const url = `${base}?text=${encodeURIComponent(q)}&limit=${limit}&format=json&apiKey=${key}`
    const data = await upstreamJSON(fetchFn, url)
    const rows = (data.results ?? []).map((r) => ({
      display_name: r.formatted,
      lat: String(r.lat),
      lon: String(r.lon),
    }))
    return { mock: false, body: rows }
  }
}
