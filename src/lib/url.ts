export interface RouteQuery {
  from: string
  to: string
  intervalMin: number
}

export const MIN_INTERVAL = 5
export const MAX_INTERVAL = 240
export const DEFAULT_INTERVAL = 30

/** Clamp a checkpoint interval to [MIN_INTERVAL, MAX_INTERVAL]; non-finite → default. */
export const clampInterval = (n: number): number =>
  Number.isFinite(n) ? Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(n))) : DEFAULT_INTERVAL

/** Serialise a route to a query string (no leading `?`). */
export function encodeRoute(r: RouteQuery): string {
  return new URLSearchParams({
    from: r.from,
    to: r.to,
    interval: String(r.intervalMin),
  }).toString()
}

/** Parse a `location.search`; null unless both endpoints are present. */
export function decodeRoute(search: string): RouteQuery | null {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const from = p.get('from')?.trim()
  const to = p.get('to')?.trim()
  if (!from || !to) return null
  const raw = p.get('interval')
  return {
    from,
    to,
    intervalMin: raw == null ? DEFAULT_INTERVAL : clampInterval(Number(raw)),
  }
}
