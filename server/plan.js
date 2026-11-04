import { readFileSync } from 'node:fs'

/** Same limits as the frontend's src/lib/entitlements.ts — both read shared/plan.json. */
const config = JSON.parse(readFileSync(new URL('../shared/plan.json', import.meta.url), 'utf8'))

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
export const FREE_HORIZON_MS = config.freeHorizonHours * HOUR_MS
export const PRO_FEATURES = config.proFeatures

/**
 * The caller's plan. The one source for /me and every server-side check.
 * ponytail: no accounts/billing yet (always mock) — MOCK_PRO=1 grants pro to everyone;
 * replace with a subscription lookup for the authenticated customer.
 */
export const planFor = (_req, env) => (env.MOCK_PRO === '1' ? 'pro' : 'free')

/** Last hour (ms) an Open-Meteo request asks for: end_hour, end_date, or forecast_days (API default 7). NaN if malformed. */
export function weatherEndMs(params, nowMs) {
  if (params.has('end_hour')) return Date.parse(params.get('end_hour') + 'Z')
  if (params.has('end_date')) return Date.parse(params.get('end_date') + 'T23:00Z')
  const days = params.has('forecast_days') ? Number(params.get('forecast_days')) : 7
  if (!Number.isInteger(days) || days < 0) return NaN
  return Math.floor(nowMs / DAY_MS) * DAY_MS + days * DAY_MS - HOUR_MS
}

/**
 * Free requests may reach up to the hour that contains now + 24 h. The client
 * rounds its last ETA up to a whole hour, so this matches its "ends within 24 h" rule.
 */
export const freeLimitMs = (nowMs) => Math.ceil((nowMs + FREE_HORIZON_MS) / HOUR_MS) * HOUR_MS

/** Pro features a weather request needs: `feature=best-time` flag and/or a window past the free horizon. */
export function weatherFeatures(params, nowMs) {
  const needed = []
  if (params.get('feature') === 'best-time') needed.push('best-time')
  if (weatherEndMs(params, nowMs) > freeLimitMs(nowMs)) needed.push('multi-day')
  return needed
}

/** First feature this plan lacks, or undefined. */
export const missingFeature = (plan, features) =>
  plan === 'pro' ? undefined : features.find((f) => PRO_FEATURES.includes(f))
