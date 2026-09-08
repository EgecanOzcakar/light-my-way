import { describe, it, expect } from 'vitest'
import { encodeRoute, decodeRoute } from './url'

describe('route url codec', () => {
  it('round-trips', () => {
    const r = { from: 'Times Square, NY', to: 'Central Park', intervalMin: 15 }
    expect(decodeRoute('?' + encodeRoute(r))).toEqual(r)
  })
  it('accepts a search string with no leading ?', () => {
    expect(decodeRoute(encodeRoute({ from: 'a', to: 'b', intervalMin: 30 }))).toEqual({
      from: 'a',
      to: 'b',
      intervalMin: 30,
    })
  })
  it('returns null without both endpoints', () => {
    expect(decodeRoute('?from=OnlyStart')).toBeNull()
    expect(decodeRoute('')).toBeNull()
  })
  it('defaults and clamps interval', () => {
    expect(decodeRoute('?from=a&to=b')!.intervalMin).toBe(30)
    expect(decodeRoute('?from=a&to=b&interval=999')!.intervalMin).toBe(240)
    expect(decodeRoute('?from=a&to=b&interval=1')!.intervalMin).toBe(5)
    expect(decodeRoute('?from=a&to=b&interval=abc')!.intervalMin).toBe(30)
  })
})
