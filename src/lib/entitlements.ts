import { useEffect, useState } from 'react'
import type { Checkpoint } from '../types'
import { API_BASE } from './config'

/**
 * The single source of truth for freemium gating. The plan comes from the
 * proxy's `/me`; without a proxy (or on any error) everyone is on "free".
 * ponytail: no billing/auth yet — /me decides; wire real accounts there.
 */
export type Plan = 'free' | 'pro'
export type Feature = 'multi-day' | 'best-time' | 'alerts'

const PRO_ONLY: readonly Feature[] = ['multi-day', 'best-time', 'alerts']

export const can = (plan: Plan, feature: Feature): boolean => plan === 'pro' || !PRO_ONLY.includes(feature)

/** Free trips must finish within this window from now. */
export const FREE_HORIZON_MS = 24 * 3600_000

/** True when the trip ends more than 24 h from now (long drive or far-off departure). */
export const isMultiDay = (checkpoints: Checkpoint[], nowMs: number = Date.now()): boolean =>
  checkpoints.some((c) => new Date(c.etaISO).getTime() - nowMs > FREE_HORIZON_MS)

export async function fetchPlan(base: string = API_BASE, fetchFn: typeof fetch = fetch): Promise<Plan> {
  if (!base) return 'free'
  try {
    const res = await fetchFn(`${base}/me`)
    if (!res.ok) return 'free'
    const body = (await res.json()) as { plan?: string }
    return body.plan === 'pro' ? 'pro' : 'free'
  } catch {
    return 'free'
  }
}

let planOnce: Promise<Plan> | undefined

/** The plan, fetched once per page load. */
export const getPlan = (): Promise<Plan> => (planOnce ??= fetchPlan())

/** Current plan; "free" until /me answers. Fetched once per page load. */
export function usePlan(): Plan {
  const [plan, setPlan] = useState<Plan>('free')
  useEffect(() => {
    let live = true
    void getPlan().then((p) => live && setPlan(p))
    return () => {
      live = false
    }
  }, [])
  return plan
}
