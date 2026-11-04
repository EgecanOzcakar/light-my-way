import type { CheckpointWeather, HazardKind } from '../types'

/** Every hazard threshold in one place. Hourly values as returned by Open-Meteo. */
export const HAZARD_THRESHOLDS = {
  /** At or below this with any precipitation → ice. User-adjustable in Settings. */
  iceC: 0,
  /** Snowfall (cm/h) above this. */
  snowCm: 0,
  /** Wind gusts (km/h) at or above this. */
  gustKmh: 60,
  /** Visibility (m) below this → fog / low visibility. */
  visibilityM: 1000,
  /** Precipitation (mm/h) at or above this → heavy rain. */
  heavyRainMm: 4,
}

export type HazardThresholds = typeof HAZARD_THRESHOLDS

/** The hazards present in one hourly weather sample. Empty = safe. */
export function hazardsFor(w: CheckpointWeather, t: HazardThresholds = HAZARD_THRESHOLDS): HazardKind[] {
  const out: HazardKind[] = []
  if (w.tempC <= t.iceC && w.precipMm > 0) out.push('ice')
  if ((w.snowCm ?? 0) > t.snowCm) out.push('snow')
  if ((w.gustKmh ?? 0) >= t.gustKmh) out.push('wind')
  if (w.visibilityM != null && w.visibilityM < t.visibilityM) out.push('fog')
  if (w.precipMm >= t.heavyRainMm) out.push('heavy-rain')
  return out
}

export const HAZARD_LABEL: Record<HazardKind, string> = {
  ice: 'ice',
  snow: 'snow',
  wind: 'strong gusts',
  fog: 'low visibility',
  'heavy-rain': 'heavy rain',
}
