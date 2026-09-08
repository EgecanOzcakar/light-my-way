import { useState } from 'react'
import { useApp } from '../store'
import { calculateTrip, GeocodeError } from '../lib/calculate'
import { encodeRoute, MIN_INTERVAL, MAX_INTERVAL } from '../lib/url'
import { toJSON, toCSV, toICS, downloadText } from '../lib/export'
import { formatDistance, formatDuration, formatClock, formatTemp, formatOffset } from '../lib/format'
import { SearchField } from './SearchField'
import type { RecentRoute } from '../types'

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

  async function run(f = from, t = to, iv = intervalMin) {
    if (!f.trim() || !t.trim()) return
    setPending(true)
    dispatch({ type: 'RUN_START' })
    try {
      const { route, checkpoints, warnings } = await calculateTrip(
        { from: f, to: t, intervalMin: iv },
        state.settings,
      )
      dispatch({ type: 'RUN_OK', route, checkpoints, warnings })
      const recent: RecentRoute = { from: f, to: t, intervalMin: iv, savedISO: new Date().toISOString() }
      dispatch({ type: 'ADD_RECENT', route: recent })
      window.history.replaceState(null, '', '?' + encodeRoute({ from: f, to: t, intervalMin: iv }))
    } catch (err) {
      const msg =
        err instanceof GeocodeError
          ? `Couldn't find the ${err.field === 'from' ? 'origin' : 'destination'}. Try a more specific name.`
          : 'Something went wrong calculating the route.'
      dispatch({ type: 'RUN_ERR', error: msg })
    } finally {
      setPending(false)
    }
  }

  const hazardCount = state.checkpoints.filter((c) => c.hazard).length

  return (
    <div className="sidebar-inner">
      <header className="brand">
        <strong>◆ LIGHT MY WAY</strong>
        <button className="icon-btn" onClick={props.onOpenSettings} aria-label="Settings">
          ⚙
        </button>
      </header>

      <SearchField label="From" value={from} onChange={props.onFrom} />
      <SearchField label="To" value={to} onChange={props.onTo} />

      <label className="field-label">Checkpoint interval (minutes)</label>
      <input
        className="field-input"
        type="number"
        min={MIN_INTERVAL}
        max={MAX_INTERVAL}
        step={5}
        value={intervalMin}
        onChange={(e) => props.onInterval(Number(e.target.value))}
      />

      <button className="primary-btn" disabled={pending} onClick={() => run()}>
        {pending ? 'Calculating…' : '▶ Calculate route'}
      </button>

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
                  {cp.hazard && <span className="hazard-tag"> ⚠ hazard</span>}
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
