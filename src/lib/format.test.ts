import { describe, it, expect } from 'vitest'
import { formatDistance, formatTemp, formatDuration, formatOffset } from './format'

describe('format', () => {
  it('distance by unit system', () => {
    expect(formatDistance(2150, 'metric')).toBe('2.1 km')
    expect(formatDistance(1609.344, 'imperial')).toBe('1.0 mi')
  })
  it('temperature by unit system', () => {
    expect(formatTemp(0, 'metric')).toBe('0°C')
    expect(formatTemp(100, 'imperial')).toBe('212°F')
  })
  it('duration', () => {
    expect(formatDuration(3600)).toBe('1h 0m')
    expect(formatDuration(480)).toBe('8 min')
  })
  it('offset', () => {
    expect(formatOffset(0)).toBe('start')
    expect(formatOffset(30)).toBe('+30 min')
  })
})
