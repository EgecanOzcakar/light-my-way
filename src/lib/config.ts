/**
 * Every external endpoint, from Vite env. With VITE_API_BASE set the app talks to
 * the proxy in `server/` (which speaks the same wire formats); otherwise it uses
 * the public demo services directly. Individual VITE_*_URL vars override either.
 */
const env = import.meta.env

export const API_BASE = (env.VITE_API_BASE || '').replace(/\/$/, '')
const viaApi = (path: string, fallback: string): string => (API_BASE ? API_BASE + path : fallback)

export const GEOCODER_URL = env.VITE_GEOCODER_URL || viaApi('/geocode', 'https://nominatim.openstreetmap.org')
export const ROUTER_URL = env.VITE_ROUTER_URL || viaApi('', 'https://routing.openstreetmap.de/routed-car') // proxy serves /route/v1/driving/…
export const WEATHER_URL = env.VITE_WEATHER_URL || viaApi('/weather', 'https://api.open-meteo.com/v1/forecast')

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const PROTOMAPS_ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> ' + OSM_ATTRIBUTION

/** 'osm' (raster XYZ, default) or 'pmtiles' (self-hosted Protomaps vector archive). */
export const TILE_SOURCE: 'osm' | 'pmtiles' = env.VITE_TILE_SOURCE === 'pmtiles' ? 'pmtiles' : 'osm'
export const TILE_URL =
  TILE_SOURCE === 'pmtiles'
    ? env.VITE_PMTILES_URL || ''
    : env.VITE_TILE_URL || viaApi('/tiles/{z}/{x}/{y}.png', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png')
export const TILE_ATTRIBUTION =
  env.VITE_TILE_ATTRIBUTION || (TILE_SOURCE === 'pmtiles' ? PROTOMAPS_ATTRIBUTION : OSM_ATTRIBUTION)
