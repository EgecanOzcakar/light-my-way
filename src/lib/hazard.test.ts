import { describe, it, expect } from 'vitest'
import { isHazardous } from './hazard'

describe('isHazardous', () => {
  it('flags cold + wet', () => expect(isHazardous(4, 0.3, 25)).toBe(true))
  it('ignores cold + dry', () => expect(isHazardous(4, 0, 25)).toBe(false))
  it('ignores warm + wet', () => expect(isHazardous(26, 2, 25)).toBe(false))
  it('treats threshold as inclusive', () => expect(isHazardous(25, 1, 25)).toBe(true))
  it('respects a custom threshold', () => expect(isHazardous(10, 1, 5)).toBe(false))
})
