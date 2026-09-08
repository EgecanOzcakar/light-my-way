export interface LatLng {
  lat: number
  lng: number
}

export type CheckpointKind = 'origin' | 'interval' | 'destination'

export interface CheckpointWeather {
  tempC: number
  precipMm: number
  icon: string
}

export interface Checkpoint {
  id: string
  label: string
  coord: LatLng
  etaISO: string
  offsetMin: number
  cumulativeKm: number
  kind: CheckpointKind
  weather?: CheckpointWeather
  hazard: boolean
}

export interface RouteResult {
  polyline: LatLng[]
  distanceM: number
  durationS: number
  approximate: boolean
}

export type Units = 'metric' | 'imperial'
export type Theme = 'dark' | 'light'

export interface Settings {
  hazardThresholdC: number
  routingBaseUrl: string
  units: Units
  theme: Theme
}

export interface RecentRoute {
  from: string
  to: string
  intervalMin: number
  savedISO: string
}
