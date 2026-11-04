import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import type { Checkpoint, RecentRoute, RouteResult, Settings } from './types'
import type { Warning } from './lib/calculate'
import { DEFAULT_ROUTING_BASE_URL } from './lib/routing'
import { HAZARD_THRESHOLDS } from './lib/hazard'
import type { RouteQuery } from './lib/url'

const SETTINGS_KEY = 'lmw:settings'
const RECENT_KEY = 'lmw:recent'
const RECENT_MAX = 10

export const DEFAULT_SETTINGS: Settings = {
  iceThresholdC: HAZARD_THRESHOLDS.iceC,
  routingBaseUrl: DEFAULT_ROUTING_BASE_URL,
  units: 'metric',
  theme: 'dark',
}

export interface AppState {
  status: 'idle' | 'loading' | 'done' | 'error'
  route?: RouteResult
  /** The query the current `route` was calculated from (source of the share URL). */
  query?: RouteQuery
  checkpoints: Checkpoint[]
  warnings: Warning[]
  error?: string
  hoveredId?: string
  recent: RecentRoute[]
  settings: Settings
}

type Action =
  | { type: 'RUN_START' }
  | { type: 'RUN_OK'; query: RouteQuery; route: RouteResult; checkpoints: Checkpoint[]; warnings: Warning[] }
  | { type: 'RUN_ERR'; error: string }
  | { type: 'HOVER'; id?: string }
  | { type: 'SET_SETTINGS'; settings: Partial<Settings> }
  | { type: 'ADD_RECENT'; route: RecentRoute }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'RUN_START':
      return { ...state, status: 'loading', error: undefined }
    case 'RUN_OK':
      return {
        ...state,
        status: 'done',
        query: action.query,
        route: action.route,
        checkpoints: action.checkpoints,
        warnings: action.warnings,
      }
    case 'RUN_ERR':
      return { ...state, status: 'error', error: action.error }
    case 'HOVER':
      return { ...state, hoveredId: action.id }
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } }
    case 'ADD_RECENT': {
      const deduped = state.recent.filter(
        (r) => !(r.from === action.route.from && r.to === action.route.to),
      )
      return { ...state, recent: [action.route, ...deduped].slice(0, RECENT_MAX) }
    }
    default:
      return state
  }
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

interface Ctx {
  state: AppState
  dispatch: React.Dispatch<Action>
}

const AppContext = createContext<Ctx | null>(null)

/**
 * Read persisted settings/recent synchronously as the initial state, so nothing
 * (a shared-link auto-run, or the write-back effects below under StrictMode)
 * ever sees or persists the defaults first.
 */
function loadInitialState(): AppState {
  let recent: RecentRoute[] = []
  try {
    recent = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentRoute[]
  } catch {
    recent = []
  }
  return {
    status: 'idle',
    checkpoints: [],
    warnings: [],
    recent,
    settings: readJSON<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS),
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState)

  useEffect(() => {
    writeJSON(SETTINGS_KEY, state.settings)
    document.documentElement.dataset.theme = state.settings.theme
  }, [state.settings])

  useEffect(() => {
    writeJSON(RECENT_KEY, state.recent)
  }, [state.recent])

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
