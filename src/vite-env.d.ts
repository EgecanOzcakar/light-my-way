/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the proxy in server/ (e.g. https://api.example.com). Unset → public demo services. */
  readonly VITE_API_BASE?: string
  /** Nominatim-compatible geocoder base URL. */
  readonly VITE_GEOCODER_URL?: string
  /** Default OSRM-compatible routing base URL (still overridable in Settings). */
  readonly VITE_ROUTER_URL?: string
  /** Open-Meteo-compatible forecast endpoint. */
  readonly VITE_WEATHER_URL?: string
  /** 'osm' (default) or 'pmtiles'. */
  readonly VITE_TILE_SOURCE?: string
  /** XYZ raster tile URL template (osm source). */
  readonly VITE_TILE_URL?: string
  /** URL of a self-hosted .pmtiles archive (pmtiles source). */
  readonly VITE_PMTILES_URL?: string
  /** Attribution HTML override for the tile layer. */
  readonly VITE_TILE_ATTRIBUTION?: string
}
