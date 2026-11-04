import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { calculateTrip, GeocodeError, PlanError } from '../lib/calculate'
import { clampInterval, MIN_INTERVAL, MAX_INTERVAL } from '../lib/url'
import { toJSON, toCSV, toICS, downloadText } from '../lib/export'
import { formatDistance, formatDuration, formatClock, formatTemp, formatOffset } from '../lib/format'
import { scoreDepartures, bestDeparture, type DepartureOption } from '../lib/departure'
import { can, usePlan, FREE_HORIZON_MS } from '../lib/entitlements'
import { HAZARD_LABEL } from '../lib/hazard'
import { SearchField } from './SearchField'
import type { Checkpoint, HazardKind, RecentRoute } from '../types'

const BEST_TIME_HOURS = 12

/** ISO → value for <input type="datetime-local"> (local wall time, minutes). */
const toLocalInput = (ms: number): string =>
  new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

/** First checkpoint per hazard kind, in route order. */
function alertsFor(checkpoints: Checkpoint[]): [HazardKind, Checkpoint][] {
  const first = new Map<HazardKind, Checkpoint>()
  for (const c of checkpoints) for (const k of c.hazards ?? []) if (!first.has(k)) first.set(k, c)
  return [...first]
}

interface Props {
  from: string
  to: string
  intervalMin: number
  onFrom: (v: string) => void
  onTo: (v: string) => void
  onInterval: (v: number) => void
  onOpenSettings: () => void
}

export function Sidebar(props: Props) {
  const { state, dispatch } = useApp()
  const { from, to, intervalMin } = props
  const [pending, setPending] = useState(false)
  const plan = usePlan()
  // '' = leave now
  const [departLocal, setDepartLocal] = useState('')
  const [options, setOptions] = useState<DepartureOption[] | null | 'loading'>()
  // Raw text so the field can be cleared while typing; committed (clamped) on blur/run.
  const [ivText, setIvText] = useState(String(intervalMin))
  useEffect(() => setIvText(String(intervalMin)), [intervalMin])
  const commitInterval = (): number => {
    const iv = ivText.trim() === '' ? intervalMin : clampInterval(Number(ivText))
    setIvText(String(iv))
    props.onInterval(iv)
    return iv
  }

  async function run(
    f = from,
    t = to,
    iv = commitInterval(),
    startISO = departLocal ? new Date(departLocal).toISOString() : undefined,
  ) {
    if (!f.trim() || !t.trim()) return
    setPending(true)
    setOptions(undefined)
    dispatch({ type: 'RUN_START' })
    try {
      const { route, checkpoints, warnings } = await calculateTrip(
        { from: f, to: t, intervalMin: iv, startISO, plan },
        state.settings,
      )
      dispatch({ type: 'RUN_OK', query: { from: f, to: t, intervalMin: iv }, route, checkpoints, warnings })
      const recent: RecentRoute = { from: f, to: t, intervalMin: iv, savedISO: new Date().toISOString() }
      dispatch({ type: 'ADD_RECENT', route: recent })
    } catch (err) {
      const msg =
        err instanceof GeocodeError
          ? `Couldn't find the ${err.field === 'from' ? 'origin' : 'destination'}. Try a more specific name.`
          : err instanceof PlanError
            ? 'Trips ending more than 24 h from now are a Pro feature.'
            : 'Something went wrong calculating the route.'
      dispatch({ type: 'RUN_ERR', error: msg })
    } finally {
      setPending(false)
    }
  }

  async function findBestTime() {
    setOptions('loading')
    setOptions(await scoreDepartures(state.checkpoints, state.settings, { hours: BEST_TIME_HOURS }))
  }

  const hazardCount = state.checkpoints.filter((c) => c.hazard).length
  const best = Array.isArray(options) ? bestDeparture(options) : undefined
  const alerts = alertsFor(state.checkpoints)

  return (
    <div className="sidebar-inner">
      <header className="brand">
        <strong>◆ LIGHT MY WAY</strong>
        <button className="icon-btn" onClick={props.onOpenSettings} aria-label="Settings">
          ⚙
        </button>
      </header>

      <form
        className="run-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <SearchField label="From" value={from} onChange={props.onFrom} />
        <SearchField label="To" value={to} onChange={props.onTo} />

        <label className="field-label">Checkpoint interval (minutes)</label>
        <input
          className="field-input"
          type="number"
          min={MIN_INTERVAL}
          max={MAX_INTERVAL}
          step={5}
          value={ivText}
          onChange={(e) => setIvText(e.target.value)}
          onBlur={commitInterval}
        />

        <label className="field-label">Departure (empty = now)</label>
        <input
          className="field-input"
          type="datetime-local"
          value={departLocal}
          max={can(plan, 'multi-day') ? undefined : toLocalInput(Date.now() + FREE_HORIZON_MS)}
          onChange={(e) => setDepartLocal(e.target.value)}
        />

        <button className="primary-btn" type="submit" disabled={pending}>
          {pending ? 'Calculating…' : '▶ Calculate route'}
        </button>
      </form>

      {state.route && (
        <>
          <div className="stats">
            <div className="stat">
              <span className="num mono">{formatDistance(state.route.distanceM, state.settings.units)}</span>
              distance
            </div>
            <div className="stat">
              <span className="num mono">{formatDuration(state.route.durationS)}</span>
              drive
            </div>
            <div className="stat">
              <span className="num mono">{state.checkpoints.length}</span>
              checkpoints
            </div>
            <div className="stat">
              <span className="num mono" style={{ color: hazardCount ? 'var(--hazard)' : undefined }}>
                {hazardCount}
              </span>
              hazards
            </div>
          </div>

          <div className="export-row">
            <span className="field-label">Export</span>
            <button
              className="link-btn"
              onClick={() => downloadText('route.json', 'application/json', toJSON(state.checkpoints, state.route!))}
            >
              JSON
            </button>
            <button
              className="link-btn"
              onClick={() => downloadText('route.csv', 'text/csv', toCSV(state.checkpoints))}
            >
              CSV
            </button>
            <button
              className="link-btn"
              onClick={() => downloadText('route.ics', 'text/calendar', toICS(state.checkpoints))}
            >
              ICS
            </button>
          </div>

          <div className="panel">
            <span className="field-label">Alerts {!can(plan, 'alerts') && <span className="pro-tag">PRO</span>}</span>
            {!can(plan, 'alerts') ? (
              <p className="dim">Hazard alerts along the route are a Pro feature.</p>
            ) : alerts.length === 0 ? (
              <p className="dim">No hazards expected.</p>
            ) : (
              <ul className="alerts">
                {alerts.map(([kind, c]) => (
                  <li key={kind}>
                    ⚠ {HAZARD_LABEL[kind]} from <span className="mono">{formatClock(c.etaISO)}</span> near {c.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <span className="field-label">
              Best time to leave {!can(plan, 'best-time') && <span className="pro-tag">PRO</span>}
            </span>
            <button
              className="link-btn"
              disabled={!can(plan, 'best-time') || options === 'loading'}
              onClick={() => void findBestTime()}
            >
              {options === 'loading' ? 'Scoring…' : `Compare departures over the next ${BEST_TIME_HOURS} h`}
            </button>
            {options === null && <p className="dim">Weather unavailable — couldn't score departures.</p>}
            {Array.isArray(options) && (
              <ul className="departures">
                {options.map((o) => (
                  <li key={o.departISO}>
                    <button
                      className={`recent-item${o === best ? ' best' : ''}`}
                      onClick={() => {
                        setDepartLocal(toLocalInput(Date.parse(o.departISO)))
                        void run(from, to, intervalMin, o.departISO)
                      }}
                    >
                      <span className="mono">{formatClock(o.departISO)}</span> ·{' '}
                      {o.complete ? `${o.hazardCount} hazard${o.hazardCount === 1 ? '' : 's'}` : 'no forecast'}
                      {o.kinds.length > 0 && <span className="dim"> ({o.kinds.map((k) => HAZARD_LABEL[k]).join(', ')})</span>}
                      {o === best && ' ★ best'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ul className="schedule">
            {state.checkpoints.map((cp) => (
              <li
                key={cp.id}
                className={cp.hazard ? 'hazard' : ''}
                onMouseEnter={() => dispatch({ type: 'HOVER', id: cp.id })}
                onMouseLeave={() => dispatch({ type: 'HOVER', id: undefined })}
              >
                <div className="sched-top mono">
                  {formatClock(cp.etaISO)} <span className="dim">{formatOffset(cp.offsetMin)}</span>
                </div>
                <div className="sched-label">{cp.label}</div>
                <div className="sched-weather dim">
                  {cp.weather
                    ? `${cp.weather.icon} ${formatTemp(cp.weather.tempC, state.settings.units)} · ${cp.weather.precipMm} mm`
                    : 'weather unavailable'}
                  {cp.hazard && (
                    <span className="hazard-tag"> ⚠ {(cp.hazards ?? []).map((k) => HAZARD_LABEL[k]).join(', ')}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {state.recent.length > 0 && (
        <div className="recent">
          <span className="field-label">Recent</span>
          {state.recent.map((r) => (
            <button
              key={`${r.from}|${r.to}`}
              className="recent-item"
              onClick={() => {
                props.onFrom(r.from)
                props.onTo(r.to)
                props.onInterval(r.intervalMin)
                void run(r.from, r.to, r.intervalMin)
              }}
            >
              {r.from} → {r.to}
            </button>
          ))}
        </div>
      )}

      <footer className="credit">
        <a href="https://github.com/EgecanOzcakar/light-my-way" target="_blank" rel="noreferrer">
          Open source
        </a>{' '}
        · OpenStreetMap · Open-Meteo
      </footer>
    </div>
  )
}
