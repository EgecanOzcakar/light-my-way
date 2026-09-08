import type { Units } from '../types'

export function formatDistance(meters: number, units: Units): string {
  if (units === 'imperial') return `${(meters / 1609.344).toFixed(1)} mi`
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatTemp(celsius: number, units: Units): string {
  if (units === 'imperial') return `${Math.round((celsius * 9) / 5 + 32)}°F`
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
