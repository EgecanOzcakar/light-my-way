/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Nominatim-compatible geocoder base URL. */
  readonly VITE_GEOCODER_URL?: string
  /** Default OSRM-compatible routing base URL (still overridable in Settings). */
  readonly VITE_ROUTER_URL?: string
  /** Open-Meteo-compatible forecast endpoint. */
  readonly VITE_WEATHER_URL?: string
  /** XYZ raster tile URL template. */
  readonly VITE_TILE_URL?: string
}
