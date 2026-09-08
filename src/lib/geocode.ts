import type { LatLng } from '../types'

export interface GeoHit {
  label: string
  coord: LatLng
}

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const CACHE_PREFIX = 'lmw:geocode:'

const memCache = new Map<string, GeoHit | null>()

const norm = (q: string): string => q.trim().toLowerCase().replace(/\s+/g, ' ')

/** Test hook — drop the in-memory cache. */
export function _clearGeocodeCache(): void {
  memCache.clear()
}

function readPersisted(key: string): GeoHit | null | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    return raw ? (JSON.parse(raw) as GeoHit) : undefined
  } catch {
    return undefined
  }
}

function persist(key: string, value: GeoHit): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch {
    /* private mode / quota — cache stays in memory only */
  }
}

interface NominatimRow {
  display_name: string
  lat: string
  lon: string
}

const toHit = (r: NominatimRow): GeoHit => ({
  label: r.display_name,
  coord: { lat: Number(r.lat), lng: Number(r.lon) },
})

/** Geocode a free-text place to its top match, or null. Cached in memory + localStorage. */
export async function geocode(query: string, fetchFn: typeof fetch = fetch): Promise<GeoHit | null> {
  const key = norm(query)
  if (!key) return null
  if (memCache.has(key)) return memCache.get(key)!
  const cached = readPersisted(key)
  if (cached !== undefined) {
    memCache.set(key, cached)
    return cached
  }

  let hit: GeoHit | null = null
  try {
    const res = await fetchFn(
      `${NOMINATIM}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    )
    if (res.ok) {
      const rows = (await res.json()) as NominatimRow[]
      if (rows.length > 0) hit = toHit(rows[0])
    }
  } catch {
    return null // transient — don't poison the cache
  }

  memCache.set(key, hit)
  if (hit) persist(key, hit)
  return hit
}

/** Up to 5 matches for autocomplete. Not cached (queries change every keystroke). */
export async function suggest(query: string, fetchFn: typeof fetch = fetch): Promise<GeoHit[]> {
  if (!query.trim()) return []
  try {
    const res = await fetchFn(
      `${NOMINATIM}/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`,
    )
    if (!res.ok) return []
    return ((await res.json()) as NominatimRow[]).map(toHit)
  } catch {
    return []
  }
}

/** Best-effort place name for a coordinate. */
export async function reverseGeocode(
  coord: LatLng,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchFn(
      `${NOMINATIM}/reverse?format=jsonv2&lat=${coord.lat}&lon=${coord.lng}`,
    )
    if (!res.ok) return null
    const row = (await res.json()) as { display_name?: string }
    return row.display_name ?? null
  } catch {
    return null
  }
}
