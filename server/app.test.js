// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createServer } from 'node:http'
import { createApp } from './app.js'
import { decodePolyline6 } from './providers/routing.js'

const servers = []
afterEach(() => servers.splice(0).forEach((s) => s.close()))

/** Start the proxy on a random port; returns a GET helper. */
async function start(env = {}, fetchFn = vi.fn(), now = Date.now) {
  const server = createServer(createApp({ env, fetchFn, now }))
  servers.push(server)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  return { get: (path) => fetch(base + path), fetchFn }
}

const json = (body) => ({ ok: true, status: 200, json: async () => body })

describe('proxy — mock mode (no keys)', () => {
  it('geocodes from fixtures in Nominatim format, labelled as mock', async () => {
    const { get, fetchFn } = await start()
    const res = await get('/geocode/search?format=jsonv2&limit=1&q=Istanbul')
    expect(res.headers.get('x-mock-data')).toBe('true')
    const rows = await res.json()
    expect(rows).toHaveLength(1)
    expect(rows[0].display_name).toMatch(/^\[mock\] Istanbul/)
    expect(Number(rows[0].lat)).toBeCloseTo(41.0, 0)
    expect(await (await get('/geocode/search?q=nowhereville')).json()).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('routes in OSRM format with a road-like detour', async () => {
    const { get } = await start()
    const res = await get('/route/v1/driving/28.9784,41.0082;32.8597,39.9334?overview=full&geometries=geojson')
    const body = await res.json()
    const r = body.routes[0]
    expect(r.distance / 1000).toBeGreaterThan(350 * 1.2) // ~350 km great-circle
    expect(r.duration).toBeGreaterThan(5 * 3600)
    expect(r.geometry.coordinates[0]).toEqual([28.9784, 41.0082])
    expect(r.geometry.coordinates.at(-1)).toEqual([32.8597, 39.9334])
  })

  it('returns Open-Meteo shaped hourly weather per location with hazard-relevant fields', async () => {
    const { get } = await start({ MOCK_PRO: '1' }) // 2 days > free horizon
    const res = await get(
      '/weather?latitude=41,40&longitude=29,33&hourly=temperature_2m,precipitation,snowfall,wind_gusts_10m,visibility&timezone=UTC&forecast_days=2',
    )
    const blocks = await res.json()
    expect(blocks).toHaveLength(2)
    expect(blocks[0].mock).toBe(true)
    for (const f of ['temperature_2m', 'precipitation', 'snowfall', 'wind_gusts_10m', 'visibility']) {
      expect(blocks[0].hourly[f]).toHaveLength(48)
    }
    expect(blocks[0].hourly.time[0]).toMatch(/T00:00$/)
    // single location → single object, like Open-Meteo
    const one = await (await get('/weather?latitude=41&longitude=29&hourly=temperature_2m&forecast_days=1')).json()
    expect(Array.isArray(one)).toBe(false)
  })

  it('/me is free by default and pro with MOCK_PRO=1', async () => {
    expect(await (await (await start()).get('/me')).json()).toMatchObject({ plan: 'free', mock: true })
    expect(await (await (await start({ MOCK_PRO: '1' })).get('/me')).json()).toMatchObject({ plan: 'pro' })
  })

  it('rate-limits per IP', async () => {
    const { get } = await start({ RATE_LIMIT_PER_MIN: '2' })
    expect((await get('/me')).status).toBe(200)
    expect((await get('/me')).status).toBe(200)
    const third = await get('/me')
    expect(third.status).toBe(429)
    expect(third.headers.get('retry-after')).toBe('60')
  })

  it('404s unknown paths and allows CORS', async () => {
    const res = await (await start()).get('/nope')
    expect(res.status).toBe(404)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})

describe('proxy — keyed adapters', () => {
  it('weather uses the commercial endpoint with apikey and caches responses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ hourly: { time: [] } }))
    const { get } = await start({ OPEN_METEO_API_KEY: 'k123' }, fetchFn)
    await get('/weather?latitude=41&longitude=29&hourly=temperature_2m&forecast_days=1')
    const res = await get('/weather?forecast_days=1&longitude=29&latitude=41&hourly=temperature_2m') // same query, other order
    expect(res.headers.get('x-mock-data')).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0][0]).toMatch(/^https:\/\/customer-api\.open-meteo\.com\/v1\/forecast\?.*apikey=k123/)
  })

  it('routing posts Valhalla truck costing and maps the reply to OSRM', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      json({ trip: { summary: { length: 12.5, time: 900 }, legs: [{ shape: '_izlhA~rlgdF_{geC~ywl@' }] } }),
    )
    const { get } = await start({ ROUTER_API_KEY: 'r1', TRUCK_HEIGHT_M: '4.2' }, fetchFn)
    const body = await (await get('/route/v1/driving/-120.2,38.5;-120.95,40.7')).json()
    expect(body.routes[0]).toMatchObject({ distance: 12500, duration: 900 })
    expect(body.routes[0].geometry.coordinates[0]).toEqual([-120.2, 38.5])
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toContain('api_key=r1')
    const sent = JSON.parse(init.body)
    expect(sent.costing).toBe('truck')
    expect(sent.costing_options.truck).toMatchObject({ height: 4.2, weight: 40, length: 16.5 })
  })

  it('geocoder maps Geoapify results and returns 502 when upstream fails', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ results: [{ formatted: 'Paris, France', lat: 48.85, lon: 2.35 }] }))
      .mockResolvedValueOnce({ ok: false, status: 503 })
    const { get } = await start({ GEOAPIFY_API_KEY: 'g1' }, fetchFn)
    expect(await (await get('/geocode/search?q=paris')).json()).toEqual([
      { display_name: 'Paris, France', lat: '48.85', lon: '2.35' },
    ])
    expect((await get('/geocode/search?q=lyon')).status).toBe(502)
  })
})

describe('proxy — server-side Pro enforcement', () => {
  const NOW = Date.parse('2026-09-08T12:00:00Z') // on the hour: free limit is exactly now + 24 h
  const w = (q) => `/weather?latitude=41&longitude=29&hourly=temperature_2m&timezone=UTC&${q}`

  it('free plan: weather past 24 h is rejected with pro_required/multi-day', async () => {
    const { get } = await start({}, vi.fn(), () => NOW)
    const res = await get(w('start_hour=2026-09-08T12:00&end_hour=2026-09-10T08:00'))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'pro_required', feature: 'multi-day' })
    // forecast_days windows too (Open-Meteo default is 7 days when omitted)
    expect((await get(w('forecast_days=3'))).status).toBe(403)
    expect((await get('/weather?latitude=41&longitude=29&hourly=temperature_2m')).status).toBe(403)
  })

  it('pro plan: the same request is allowed', async () => {
    const { get } = await start({ MOCK_PRO: '1' }, vi.fn(), () => NOW)
    const res = await get(w('start_hour=2026-09-08T12:00&end_hour=2026-09-10T08:00'))
    expect(res.status).toBe(200)
    expect((await res.json()).hourly.time).toHaveLength(45) // mock honours start_hour/end_hour
  })

  it('exactly at the 24 h boundary is free; one hour past is Pro', async () => {
    const { get } = await start({}, vi.fn(), () => NOW)
    expect((await get(w('start_hour=2026-09-08T12:00&end_hour=2026-09-09T12:00'))).status).toBe(200)
    expect((await get(w('start_hour=2026-09-08T12:00&end_hour=2026-09-09T13:00'))).status).toBe(403)
    // mid-hour now: the limit rounds up to the hour containing now + 24 h, like the client's ETA rounding
    const mid = await start({}, vi.fn(), () => NOW + 30 * 60_000)
    expect((await mid.get(w('start_hour=2026-09-08T12:00&end_hour=2026-09-09T13:00'))).status).toBe(200)
    expect((await mid.get(w('start_hour=2026-09-08T12:00&end_hour=2026-09-09T14:00'))).status).toBe(403)
  })

  it('best-time flag needs Pro and is never forwarded upstream', async () => {
    const free = await start({}, vi.fn(), () => NOW)
    const res = await free.get(w('start_hour=2026-09-08T12:00&end_hour=2026-09-08T20:00&feature=best-time'))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'pro_required', feature: 'best-time' })

    const fetchFn = vi.fn().mockResolvedValue(json({ hourly: { time: [] } }))
    const pro = await start({ MOCK_PRO: '1', OPEN_METEO_API_KEY: 'k' }, fetchFn, () => NOW)
    expect((await pro.get(w('start_hour=2026-09-08T12:00&end_hour=2026-09-08T20:00&feature=best-time'))).status).toBe(200)
    expect(fetchFn.mock.calls[0][0]).not.toContain('feature=')
  })

  it('rejects a malformed window instead of letting it through', async () => {
    const { get } = await start({}, vi.fn(), () => NOW)
    expect((await get(w('start_hour=x&end_hour=garbage'))).status).toBe(400)
  })
})

describe('decodePolyline6', () => {
  it('decodes the reference polyline', () => {
    expect(decodePolyline6('_izlhA~rlgdF_{geC~ywl@')).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
    ])
  })
})
