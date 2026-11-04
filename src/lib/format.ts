import type { Units } from '../types'

export function formatDistance(meters: number, units: Units): string {
  if (units === 'imperial') return `${(meters / 1609.344).toFixed(1)} mi`
  return `${(meters / 1000).toFixed(1)} km`
}

const cToF = (c: number): number => (c * 9) / 5 + 32
const fToC = (f: number): number => ((f - 32) * 5) / 9

/** A °C value shown in the user's units, rounded to 0.1. */
export const tempToDisplay = (celsius: number, units: Units): number =>
  Math.round((units === 'imperial' ? cToF(celsius) : celsius) * 10) / 10

/** A value typed in the user's units, back to °C (what we store and compare). */
export const tempFromDisplay = (value: number, units: Units): number =>
  units === 'imperial' ? fToC(value) : value

export function formatTemp(celsius: number, units: Units): string {
  if (units === 'imperial') return `${Math.round(cToF(celsius))}°F`
  return `${Math.round(celsius)}°C`
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatOffset(min: number): string {
  return min === 0 ? 'start' : `+${min} min`
}
