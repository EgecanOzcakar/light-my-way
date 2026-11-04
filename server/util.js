import { readFileSync } from 'node:fs'

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

/** Upstream failure → 502 to the client. */
export class UpstreamError extends Error {}

export async function upstreamJSON(fetchFn, url, init) {
  const res = await fetchFn(url, init)
  if (!res.ok) throw new UpstreamError(`upstream HTTP ${res.status}`)
  return res.json()
}

export function haversineKm(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/**
 * In-memory TTL cache, oldest-first eviction.
 * ponytail: per-process memory; move to Redis when running more than one instance.
 */
export function ttlCache({ max = 5000, now = Date.now } = {}) {
  const map = new Map()
  return {
    get(key) {
      const hit = map.get(key)
      if (!hit) return undefined
      if (hit.expires <= now()) {
        map.delete(key)
        return undefined
      }
      return hit.value
    },
    set(key, value, ttlMs) {
      map.delete(key)
      map.set(key, { value, expires: now() + ttlMs })
      if (map.size > max) map.delete(map.keys().next().value)
    },
  }
}

/**
 * Fixed one-minute window per key (client IP).
 * ponytail: per-process; use a shared store behind a load balancer.
 */
export function rateLimiter({ perMin, now = Date.now }) {
  const windows = new Map()
  return (key) => {
    const t = now()
    const w = windows.get(key)
    if (!w || t - w.start >= 60_000) {
      if (windows.size > 50_000) windows.clear()
      windows.set(key, { start: t, count: 1 })
      return true
    }
    return ++w.count <= perMin
  }
}
