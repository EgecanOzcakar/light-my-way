import { describe, it, expect, vi } from 'vitest'
import { can, fetchPlan, isMultiDay } from './entitlements'
import type { Checkpoint } from '../types'

const cp = (etaISO: string) => ({ etaISO }) as Checkpoint

describe('entitlements', () => {
  it('gates pro features', () => {
    expect(can('free', 'best-time')).toBe(false)
    expect(can('free', 'alerts')).toBe(false)
    expect(can('free', 'multi-day')).toBe(false)
    expect(can('pro', 'best-time')).toBe(true)
  })

  it('multi-day = ends more than 24 h from now', () => {
    const now = Date.parse('2026-09-08T12:00:00Z')
    expect(isMultiDay([cp('2026-09-09T11:00:00Z')], now)).toBe(false)
    expect(isMultiDay([cp('2026-09-09T13:00:00Z')], now)).toBe(true)
  })

  it('reads the plan from /me, defaulting to free', async () => {
    const ok = (plan: string) =>
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ plan }) }) as unknown as typeof fetch
    expect(await fetchPlan('https://api.test', ok('pro'))).toBe('pro')
    expect(await fetchPlan('https://api.test', ok('enterprise'))).toBe('free')
    expect(await fetchPlan('', ok('pro'))).toBe('free') // no proxy
    const down = vi.fn().mockRejectedValue(new Error('x')) as unknown as typeof fetch
    expect(await fetchPlan('https://api.test', down)).toBe('free')
  })
})
