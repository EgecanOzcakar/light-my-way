import { describe, it, expect } from 'vitest'
import { formatDistance, formatTemp, formatDuration, formatOffset, tempFromDisplay, tempToDisplay } from './format'

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

describe('hazard threshold unit conversion', () => {
  it('shows a stored °C threshold in °F for imperial and stores °C back', () => {
    expect(tempToDisplay(25, 'imperial')).toBe(77)
    expect(tempFromDisplay(77, 'imperial')).toBeCloseTo(25)
    expect(tempFromDisplay(32, 'imperial')).toBe(0)
  })
  it('is the identity for metric', () => {
    expect(tempToDisplay(25, 'metric')).toBe(25)
    expect(tempFromDisplay(25, 'metric')).toBe(25)
  })
  it('round-trips an arbitrary °F entry without drift', () => {
    expect(tempToDisplay(tempFromDisplay(51, 'imperial'), 'imperial')).toBe(51)
  })
})
