import { fixture, upstreamJSON } from '../util.js'

const DAY_MS = 86_400_000

/**
 * Weather adapter → Open-Meteo forecast response (unchanged wire format).
 * Real: Open-Meteo commercial endpoint + apikey. Mock: fixtures/weather-day.json
 * repeated per forecast day, colder further north.
 */
export function createWeather(env, fetchFn, now = Date.now) {
  const key = env.OPEN_METEO_API_KEY
  const base = env.OPEN_METEO_URL || 'https://customer-api.open-meteo.com/v1/forecast'
  const day = key ? null : fixture('weather-day.json')

  return async function forecast(params) {
    if (day) return { mock: true, body: mockForecast(day, params, now()) }
    const qs = new URLSearchParams(params)
    qs.set('apikey', key)
    return { mock: false, body: await upstreamJSON(fetchFn, `${base}?${qs}`) }
  }
}

function mockForecast(day, params, nowMs) {
  const lats = String(params.get('latitude') ?? '').split(',').map(Number)
  const lngs = String(params.get('longitude') ?? '').split(',').map(Number)
  const fields = String(params.get('hourly') ?? 'temperature_2m').split(',')
  const days = Math.min(16, Math.max(1, Number(params.get('forecast_days')) || 7))
  const start = Math.floor(nowMs / DAY_MS) * DAY_MS
  const time = Array.from({ length: days * 24 }, (_, h) => new Date(start + h * 3600_000).toISOString().slice(0, 16))

  const blocks = lats.map((lat, i) => {
    const hourly = { time }
    for (const f of fields) {
      const src = day[f]
      if (!src) continue
      // ±0.6 °C per degree of latitude away from 45°N: same shape, different locations differ a bit
      const shift = f === 'temperature_2m' ? (45 - lat) * 0.6 : 0
      hourly[f] = time.map((_, h) => Math.round((src[h % 24] + shift) * 10) / 10)
    }
    return { latitude: lat, longitude: lngs[i], timezone: 'UTC', mock: true, hourly }
  })
  return blocks.length === 1 ? blocks[0] : blocks
}
