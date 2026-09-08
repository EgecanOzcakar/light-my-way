import type { Checkpoint, RouteResult } from '../types'
import { cumulativeDistancesM, interpolateAlong } from './geo'

export interface SampleOptions {
  startISO: string
  intervalMin: number
  originLabel: string
  destinationLabel: string
}

const addMinutes = (iso: string, min: number): string =>
  new Date(new Date(iso).getTime() + min * 60_000).toISOString()

/**
 * Build the checkpoint list for a route: origin first, destination last, and an
 * evenly interpolated point every `intervalMin` minutes in between. Weather and
 * hazard are left unset — filled in later by the weather step.
 */
export function sampleCheckpoints(route: RouteResult, opts: SampleOptions): Checkpoint[] {
  const { startISO, intervalMin, originLabel, destinationLabel } = opts
  const totalMin = route.durationS / 60
  const cumM = cumulativeDistancesM(route.polyline)
  const totalKm = route.distanceM / 1000

  const offsets: number[] = [0]
  for (let t = intervalMin; t < totalMin; t += intervalMin) offsets.push(t)
  offsets.push(totalMin)

  return offsets.map((offsetMin, i): Checkpoint => {
    const isOrigin = i === 0
    const isDest = i === offsets.length - 1
    const frac = totalMin > 0 ? offsetMin / totalMin : 0
    const coord = isOrigin
      ? route.polyline[0]
      : isDest
        ? route.polyline[route.polyline.length - 1]
        : interpolateAlong(route.polyline, cumM, frac * route.distanceM)

    return {
      id: `cp-${i}`,
      kind: isOrigin ? 'origin' : isDest ? 'destination' : 'interval',
      label: isOrigin
        ? originLabel
        : isDest
          ? destinationLabel
          : `Approx. location after ${Math.round(offsetMin)} min`,
      coord,
      etaISO: addMinutes(startISO, offsetMin),
      offsetMin: Math.round(offsetMin),
      cumulativeKm: Number((frac * totalKm).toFixed(2)),
      hazard: false,
    }
  })
}
