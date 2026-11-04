import { createGeocoder } from './providers/geocode.js'
import { createRouter } from './providers/routing.js'
import { createWeather } from './providers/weather.js'
import { createTiles } from './providers/tiles.js'
import { rateLimiter, ttlCache, UpstreamError } from './util.js'

const TTL = {
  geocode: 7 * 86_400_000,
  route: 3_600_000,
  weather: 15 * 60_000,
  tiles: 86_400_000,
}

const COORDS = /^\/route\/v1\/driving\/(-?[\d.]+),(-?[\d.]+);(-?[\d.]+),(-?[\d.]+)$/
const TILE = /^\/tiles\/(\d{1,2})\/(\d+)\/(\d+)\.png$/

/**
 * The proxy as a plain (req, res) handler. Speaks the same wire formats as the
 * public services the frontend already uses (Nominatim, OSRM, Open-Meteo, XYZ
 * tiles), so pointing VITE_API_BASE here is the only frontend change.
 */
export function createApp({ env = process.env, fetchFn = fetch, now = Date.now } = {}) {
  const geocode = createGeocoder(env, fetchFn)
  const route = createRouter(env, fetchFn)
  const weather = createWeather(env, fetchFn, now)
  const tiles = createTiles(env, fetchFn)
  const cache = ttlCache({ now })
  const allow = rateLimiter({ perMin: Number(env.RATE_LIMIT_PER_MIN) || 60, now })
  const allowTiles = rateLimiter({ perMin: Number(env.TILE_RATE_LIMIT_PER_MIN) || 600, now })
  const origin = env.CORS_ORIGIN || '*'

  const send = (res, status, body, { type = 'application/json', mock = false, extra = {} } = {}) => {
    res.writeHead(status, {
      'content-type': type,
      'access-control-allow-origin': origin,
      ...(mock ? { 'x-mock-data': 'true' } : {}),
      ...extra,
    })
    res.end(type === 'application/json' ? JSON.stringify(body) : body)
  }

  /** Serve from cache or compute + cache. `fn` returns { status?, type?, mock, body }. */
  async function cached(res, key, ttl, fn) {
    let hit = cache.get(key)
    if (!hit) {
      hit = await fn()
      if ((hit.status ?? 200) === 200) cache.set(key, hit, ttl)
    }
    send(res, hit.status ?? 200, hit.body, { type: hit.type, mock: hit.mock })
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://proxy')
    const path = url.pathname
    const ip =
      (env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()) ||
      req.socket.remoteAddress ||
      'unknown'

    if (req.method === 'OPTIONS') {
      return send(res, 204, '', { type: 'text/plain', extra: { 'access-control-allow-methods': 'GET' } })
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })

    const tile = TILE.exec(path)
    if (!(tile ? allowTiles : allow)(ip)) {
      return send(res, 429, { error: 'rate limit exceeded' }, { extra: { 'retry-after': '60' } })
    }

    try {
      if (path === '/health') return send(res, 200, { ok: true, mock: mockStatus(env) })
      if (path === '/me') {
        // ponytail: no accounts/billing yet (always mock) — MOCK_PRO=1 grants pro to everyone.
        return send(res, 200, { plan: env.MOCK_PRO === '1' ? 'pro' : 'free', mock: true }, { mock: true })
      }
      if (path === '/geocode/search') {
        const q = url.searchParams.get('q') ?? ''
        const limit = Math.min(10, Math.max(1, Number(url.searchParams.get('limit')) || 1))
        return await cached(res, `g:${q.trim().toLowerCase()}:${limit}`, TTL.geocode, () => geocode(q, limit))
      }
      const c = COORDS.exec(path)
      if (c) {
        const [lng1, lat1, lng2, lat2] = c.slice(1).map(Number)
        return await cached(res, `r:${c.slice(1).join(',')}`, TTL.route, () =>
          route({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }),
        )
      }
      if (path === '/weather') {
        url.searchParams.sort()
        return await cached(res, `w:${url.searchParams}`, TTL.weather, () => weather(url.searchParams))
      }
      if (tile) {
        return await cached(res, `t:${tile.slice(1).join('/')}`, TTL.tiles, async () => ({
          mock: false,
          ...(await tiles(...tile.slice(1))),
        }))
      }
      return send(res, 404, { error: 'not found' })
    } catch (err) {
      const status = err instanceof UpstreamError ? 502 : 500
      return send(res, status, { error: status === 502 ? 'upstream unavailable' : 'internal error' })
    }
  }
}

/** Which adapters are serving fixture data (no key configured). */
export const mockStatus = (env) => ({
  geocode: !env.GEOAPIFY_API_KEY,
  route: !env.ROUTER_API_KEY,
  weather: !env.OPEN_METEO_API_KEY,
  billing: true, // no billing integration yet
})
