import { useEffect, useState } from 'react'
import type { Checkpoint } from '../types'
import { API_BASE } from './config'
import planConfig from '../../shared/plan.json'

/**
 * The single source of truth for freemium gating. The plan comes from the
 * proxy's `/me`; without a proxy (or on any error) everyone is on "free".
 * ponytail: no billing/auth yet — /me decides; wire real accounts there.
 */
export type Plan = 'free' | 'pro'
export type Feature = 'multi-day' | 'best-time' | 'alerts'

// Limits live in shared/plan.json so the proxy enforces exactly the same ones.
const PRO_ONLY = planConfig.proFeatures as readonly Feature[]

export const can = (plan: Plan, feature: Feature): boolean => plan === 'pro' || !PRO_ONLY.includes(feature)

/** Free trips must finish within this window from now. */
export const FREE_HORIZON_MS = planConfig.freeHorizonHours * 3600_000

/** A Pro feature was needed — thrown locally or from the proxy's 403 `pro_required`. */
export class PlanError extends Error {
  constructor(public feature: Feature) {
    super(`"${feature}" requires the Pro plan`)
    this.name = 'PlanError'
  }
}

const UPGRADE_TEXT: Record<Feature, string> = {
  'multi-day': 'Trips ending more than 24 h from now are a Pro feature.',
  'best-time': 'Best time to leave is a Pro feature.',
  alerts: 'Hazard alerts are a Pro feature.',
}

export const upgradeMessage = (feature: Feature): string => UPGRADE_TEXT[feature] ?? 'This needs the Pro plan.'

/** Throw PlanError if `res` is the proxy's 403 `{ error: 'pro_required', feature }`. */
export async function throwIfProRequired(res: Response): Promise<void> {
  if (res.status !== 403) return
  const body = (await res.json().catch(() => ({}))) as { error?: string; feature?: Feature }
  if (body.error === 'pro_required') throw new PlanError(body.feature ?? 'multi-day')
}

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
