import { useEffect, useRef, useState } from 'react'
import { useApp } from './store'
import { MapView } from './components/MapView'
import { Sidebar } from './components/Sidebar'
import { SettingsDrawer } from './components/SettingsDrawer'
import { calculateTrip, GeocodeError } from './lib/calculate'
import { decodeRoute, encodeRoute, DEFAULT_INTERVAL } from './lib/url'
import type { RecentRoute } from './types'

const WARNING_TEXT: Record<string, string> = {
  'routing-approximate': 'Routing unavailable — showing an approximate straight-line path.',
  'weather-unavailable': 'Weather data was unavailable for some checkpoints.',
}

export function App() {
  const { state, dispatch } = useApp()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [intervalMin, setIntervalMin] = useState(DEFAULT_INTERVAL)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const autoRan = useRef(false)

  // Auto-run a shared URL once, after persisted settings have loaded.
  useEffect(() => {
    if (autoRan.current) return
    const q = decodeRoute(window.location.search)
    if (!q) return
    autoRan.current = true
    setFrom(q.from)
    setTo(q.to)
    setIntervalMin(q.intervalMin)
    dispatch({ type: 'RUN_START' })
    calculateTrip({ from: q.from, to: q.to, intervalMin: q.intervalMin }, state.settings)
      .then(({ route, checkpoints, warnings }) => {
        dispatch({ type: 'RUN_OK', route, checkpoints, warnings })
        const recent: RecentRoute = { ...q, savedISO: new Date().toISOString() }
        dispatch({ type: 'ADD_RECENT', route: recent })
      })
      .catch((err) => {
        dispatch({
          type: 'RUN_ERR',
          error:
            err instanceof GeocodeError
              ? `Couldn't find the ${err.field === 'from' ? 'origin' : 'destination'} from the shared link.`
              : 'Could not calculate the shared route.',
        })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings])

  useEffect(() => {
    if (state.status === 'done' && from && to) {
      window.history.replaceState(null, '', '?' + encodeRoute({ from, to, intervalMin }))
    }
  }, [state.status, from, to, intervalMin])

  return (
    <div className="app">
      <main className="map-pane">
        <MapView />
      </main>

      <button className="nav-toggle" onClick={() => setNavOpen((o) => !o)} aria-label="Toggle panel">
        ☰
      </button>

      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        {(state.error || state.warnings.length > 0) && (
          <div className="banners">
            {state.error && <div className="banner error">{state.error}</div>}
            {state.warnings.map((w) => (
              <div key={w} className="banner warn">
                {WARNING_TEXT[w]}
              </div>
            ))}
          </div>
        )}
        <Sidebar
          from={from}
          to={to}
          intervalMin={intervalMin}
          onFrom={setFrom}
          onTo={setTo}
          onInterval={setIntervalMin}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </aside>

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
