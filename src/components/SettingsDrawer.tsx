import { useApp } from '../store'
import { DEFAULT_ROUTING_BASE_URL } from '../lib/routing'
import type { Settings } from '../types'

export function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp()
  const s = state.settings
  const set = (patch: Partial<Settings>) => dispatch({ type: 'SET_SETTINGS', settings: patch })

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <strong>Settings</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>

        <label className="field-label">
          Hazard temperature threshold ({s.units === 'imperial' ? '°F' : '°C'})
        </label>
        <input
          className="field-input"
          type="number"
          value={s.hazardThresholdC}
          onChange={(e) => set({ hazardThresholdC: Number(e.target.value) })}
        />

        <label className="field-label">Routing server (OSRM API base URL)</label>
        <input
          className="field-input"
          type="text"
          value={s.routingBaseUrl}
          onChange={(e) => set({ routingBaseUrl: e.target.value })}
        />
        {s.routingBaseUrl !== DEFAULT_ROUTING_BASE_URL && (
          <button
            className="link-btn"
            onClick={() => set({ routingBaseUrl: DEFAULT_ROUTING_BASE_URL })}
          >
            Reset to default
          </button>
        )}

        <label className="field-label">Units</label>
        <select
          className="field-input"
          value={s.units}
          onChange={(e) => set({ units: e.target.value as 'metric' | 'imperial' })}
        >
          <option value="metric">Metric (km, °C)</option>
          <option value="imperial">Imperial (mi, °F)</option>
        </select>

        <label className="field-label">Theme</label>
        <select
          className="field-input"
          value={s.theme}
          onChange={(e) => set({ theme: e.target.value as 'dark' | 'light' })}
        >
          <option value="dark">Dark (Co-driver)</option>
          <option value="light">Light</option>
        </select>

        <p className="drawer-note">
          Data from{' '}
          <a href="https://nominatim.org/" target="_blank" rel="noreferrer">
            Nominatim
          </a>
          ,{' '}
          <a href="https://routing.openstreetmap.de/" target="_blank" rel="noreferrer">
            OSRM
          </a>{' '}
          and{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
          . All free, no API key. Please respect their usage policies.
        </p>
      </div>
    </div>
  )
}
