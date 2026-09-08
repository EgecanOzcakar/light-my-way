# Light My Way Client-Side Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Python-CLI-plus-dead-demo with a working, fully client-side React web app that geocodes, routes, samples a weather-and-hazard schedule, and renders it on an interactive map — hosted on GitHub Pages.

**Architecture:** Vite + React + TypeScript SPA. Browser calls Nominatim, OSRM (FOSSGIS instance), and Open-Meteo directly — no backend, no API keys. Pure-function `lib/` modules (geocode, routing, weather, schedule, hazard, url, export) with a React context store on top. Routing goes through a `Provider` adapter with a great-circle fallback so a routing outage degrades instead of breaking. The Python CLI is kept, refactored into a `cli/` package that mirrors the TS lib.

**Tech Stack:** Vite 5, React 18, TypeScript 5, `leaflet` + `react-leaflet` (npm), Vitest, Python 3.8+ with `requests`, pytest.

**Spec:** `docs/superpowers/specs/2026-09-08-client-side-overhaul-design.md`

## Global Constraints

- Zero API keys, zero backend. Only keyless CORS-enabled public APIs: Nominatim (`nominatim.openstreetmap.org`), OSRM (`routing.openstreetmap.de/routed-car` default), Open-Meteo (`api.open-meteo.com`).
- No external `<script>`/`<link>` CDNs and no Google Fonts — everything bundled by Vite or committed to the repo. Fonts self-hosted.
- License stays MIT. App must remain hostable by copying the built `dist/`.
- Python CLI: `requests` is the only allowed dependency.
- Hazard rule (verbatim from current code): hazardous when `tempC <= threshold` (default 25) **and** `precipMm > 0`.
- Nominatim usage policy: send a descriptive `User-Agent`/`Referer` is automatic in browsers; max ~1 req/sec — debounce autocomplete at 400ms and cache results.
- TypeScript `strict: true`. All `lib/` functions are pure and independently unit-tested except the network wrappers.
- Base map tiles: OSM (`https://{s}.tile.openstreetmap.org/...`) with the standard attribution control — unchanged from today.

---

### Task 1: Scaffold the Vite app, remove Jekyll

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/theme.css`, `.nvmrc`
- Create: `src/vite-env.d.ts`
- Delete: `_config.yml`, `route_calculator.py` (moved in Task 14), the old `index.html` content (overwritten)
- Modify: `.gitignore` (add `node_modules`, `dist`)

**Interfaces:**
- Produces: a running `npm run dev` app rendering an empty two-pane shell (`<aside class="sidebar">` + `<main class="map-pane">`); `npm run build` emits `dist/`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "light-my-way",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "license": "MIT",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "leaflet": "^1.9.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-leaflet": "^4.2.1"
  },
  "devDependencies": {
    "@types/leaflet": "^1.9.12",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.3",
    "vite": "^5.3.4",
    "vitest": "^2.0.4"
  }
}
```

- [ ] **Step 2: `vite.config.ts`** — set `base` for project Pages hosting

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/light-my-way/',
  test: { environment: 'node' },
})
```

- [ ] **Step 3: `tsconfig.json`** — strict, bundler resolution (standard Vite React template); `tsconfig.node.json` for the config file.

- [ ] **Step 4: `index.html`** at repo root

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Light My Way — route weather &amp; hazards</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `src/main.tsx`, `src/App.tsx`** — render the shell. `App.tsx` returns `<div class="app"><aside class="sidebar"/><main class="map-pane"/></div>`.

- [ ] **Step 6: `src/styles/theme.css`** — CSS custom properties for the "Co-driver" dark theme (default) and a `:root[data-theme="light"]` block. Tokens: `--bg`, `--surface`, `--border`, `--text`, `--text-dim`, `--accent` (#7fd0ff), `--hazard` (#ff8c42), `--font-sans`, `--font-mono`. Import in `main.tsx`.

- [ ] **Step 7: Delete `_config.yml`; `git rm route_calculator.py` is deferred to Task 14 — for now leave it in place.**

- [ ] **Step 8: Run**

Run: `npm install && npm run dev`
Expected: dev server serves the two-pane shell with dark theme.
Run: `npm run build`
Expected: `dist/` produced, no TS errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React + TS app, remove Jekyll config"
```

---

### Task 2: `types.ts` and `hazard.ts`

**Files:**
- Create: `src/types.ts`, `src/lib/hazard.ts`, `src/lib/hazard.test.ts`

**Interfaces:**
- Produces:
  - `LatLng = { lat: number; lng: number }`
  - `Checkpoint = { id: string; label: string; coord: LatLng; etaISO: string; offsetMin: number; cumulativeKm: number; kind: 'origin' | 'interval' | 'destination'; weather?: { tempC: number; precipMm: number; icon: string }; hazard: boolean }`
  - `RouteResult = { polyline: LatLng[]; distanceM: number; durationS: number; approximate: boolean }`
  - `Settings = { hazardThresholdC: number; routingBaseUrl: string; units: 'metric' | 'imperial'; theme: 'dark' | 'light' }`
  - `isHazardous(tempC: number, precipMm: number, thresholdC: number): boolean`

- [ ] **Step 1: Write `src/lib/hazard.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { isHazardous } from './hazard'

describe('isHazardous', () => {
  it('flags cold + wet', () => expect(isHazardous(4, 0.3, 25)).toBe(true))
  it('ignores cold + dry', () => expect(isHazardous(4, 0, 25)).toBe(false))
  it('ignores warm + wet', () => expect(isHazardous(26, 2, 25)).toBe(false))
  it('treats threshold as inclusive', () => expect(isHazardous(25, 1, 25)).toBe(true))
  it('respects a custom threshold', () => expect(isHazardous(10, 1, 5)).toBe(false))
})
```

- [ ] **Step 2: Run — expect FAIL** (`isHazardous is not defined`)

Run: `npm test -- hazard`

- [ ] **Step 3: Implement `src/lib/hazard.ts`**

```ts
export function isHazardous(tempC: number, precipMm: number, thresholdC: number): boolean {
  return tempC <= thresholdC && precipMm > 0
}
```

Also create `src/types.ts` with the interfaces listed above.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** `feat: add core types and hazard rule`

---

### Task 3: `geo.ts` — haversine + interpolation helpers

**Files:**
- Create: `src/lib/geo.ts`, `src/lib/geo.test.ts`

**Interfaces:**
- Consumes: `LatLng` from `types.ts`
- Produces:
  - `haversineM(a: LatLng, b: LatLng): number`
  - `cumulativeDistancesM(points: LatLng[]): number[]` — length === points.length, first element 0
  - `interpolateAlong(points: LatLng[], cumM: number[], targetM: number): LatLng` — clamps to endpoints

- [ ] **Step 1: `src/lib/geo.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { haversineM, cumulativeDistancesM, interpolateAlong } from './geo'

const NY = { lat: 40.7128, lng: -74.006 }
const LA = { lat: 34.0522, lng: -118.2437 }

describe('haversineM', () => {
  it('NY->LA is ~3936 km', () => {
    expect(haversineM(NY, LA) / 1000).toBeCloseTo(3936, -2)
  })
  it('zero for identical points', () => expect(haversineM(NY, NY)).toBe(0))
})

describe('cumulativeDistancesM', () => {
  it('starts at 0 and increases', () => {
    const pts = [NY, { lat: 41, lng: -74 }, { lat: 42, lng: -74 }]
    const c = cumulativeDistancesM(pts)
    expect(c[0]).toBe(0)
    expect(c[2]).toBeGreaterThan(c[1])
  })
})

describe('interpolateAlong', () => {
  it('returns a point between the ends at the midpoint distance', () => {
    const pts = [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }]
    const c = cumulativeDistancesM(pts)
    const mid = interpolateAlong(pts, c, c[1] / 2)
    expect(mid.lng).toBeCloseTo(5, 1)
    expect(mid.lat).toBeCloseTo(0, 5)
  })
  it('clamps past the end', () => {
    const pts = [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }]
    const c = cumulativeDistancesM(pts)
    expect(interpolateAlong(pts, c, 1e9)).toEqual(pts[1])
  })
})
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement `src/lib/geo.ts`** — standard haversine (R = 6_371_000), linear lat/lng interpolation between the bracketing points for `interpolateAlong`.
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat: add geo distance and interpolation helpers`

---

### Task 4: `schedule.ts` — interval sampling

**Files:**
- Create: `src/lib/schedule.ts`, `src/lib/schedule.test.ts`

**Interfaces:**
- Consumes: `RouteResult`, `Checkpoint`, `LatLng` from `types.ts`; `haversineM`, `cumulativeDistancesM`, `interpolateAlong` from `geo.ts`
- Produces:
  - `sampleCheckpoints(route: RouteResult, opts: { startISO: string; intervalMin: number; originLabel: string; destinationLabel: string }): Checkpoint[]`
  - Rules: first checkpoint = origin (`offsetMin` 0, `cumulativeKm` 0, `kind: 'origin'`), last = destination (`offsetMin` = round(durationS/60), `kind: 'destination'`), interval checkpoints every `intervalMin` in between with `kind: 'interval'`, each positioned by `interpolateAlong` using `offsetMin/totalMin * distanceM`. `etaISO` = startISO + offset. `id` = `cp-<index>`. `hazard` defaults `false`, `weather` undefined (filled in Task 6). `label` for interval points = `"Approx. location after N min"` (reverse geocode fills the real name later, best-effort).

- [ ] **Step 1: `src/lib/schedule.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { sampleCheckpoints } from './schedule'
import type { RouteResult } from '../types'

const route: RouteResult = {
  polyline: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }],
  distanceM: 111_000,
  durationS: 3600,
  approximate: false,
}

describe('sampleCheckpoints', () => {
  const cps = sampleCheckpoints(route, {
    startISO: '2026-09-08T12:00:00.000Z',
    intervalMin: 30,
    originLabel: 'A',
    destinationLabel: 'B',
  })

  it('brackets with origin and destination', () => {
    expect(cps[0].kind).toBe('origin')
    expect(cps.at(-1)!.kind).toBe('destination')
    expect(cps[0].label).toBe('A')
    expect(cps.at(-1)!.label).toBe('B')
  })
  it('has a 30-min checkpoint in between for a 60-min trip', () => {
    expect(cps.some((c) => c.kind === 'interval' && c.offsetMin === 30)).toBe(true)
  })
  it('origin cumulativeKm is 0, destination is ~111', () => {
    expect(cps[0].cumulativeKm).toBe(0)
    expect(cps.at(-1)!.cumulativeKm).toBeCloseTo(111, 0)
  })
  it('etaISO advances with offset', () => {
    const mid = cps.find((c) => c.offsetMin === 30)!
    expect(mid.etaISO).toBe('2026-09-08T12:30:00.000Z')
  })
  it('no interval points when interval exceeds duration', () => {
    const short = sampleCheckpoints(route, { startISO: '2026-09-08T12:00:00.000Z', intervalMin: 120, originLabel: 'A', destinationLabel: 'B' })
    expect(short).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement `src/lib/schedule.ts`**
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat: add interval checkpoint sampling`

---

### Task 5: `url.ts` — shareable route codec

**Files:**
- Create: `src/lib/url.ts`, `src/lib/url.test.ts`

**Interfaces:**
- Produces:
  - `encodeRoute(r: { from: string; to: string; intervalMin: number }): string` — returns a query string without leading `?`
  - `decodeRoute(search: string): { from: string; to: string; intervalMin: number } | null` — null if `from` or `to` missing; `intervalMin` defaults 30, clamped 5..240

- [ ] **Step 1: `src/lib/url.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { encodeRoute, decodeRoute } from './url'

describe('route url codec', () => {
  it('round-trips', () => {
    const r = { from: 'Times Square, NY', to: 'Central Park', intervalMin: 15 }
    expect(decodeRoute('?' + encodeRoute(r))).toEqual(r)
  })
  it('returns null without both endpoints', () => {
    expect(decodeRoute('?from=OnlyStart')).toBeNull()
  })
  it('defaults and clamps interval', () => {
    expect(decodeRoute('?from=a&to=b')!.intervalMin).toBe(30)
    expect(decodeRoute('?from=a&to=b&interval=999')!.intervalMin).toBe(240)
    expect(decodeRoute('?from=a&to=b&interval=1')!.intervalMin).toBe(5)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement with `URLSearchParams`**
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat: add shareable route URL codec`

---

### Task 6: `routing.ts` — provider adapter + great-circle fallback

**Files:**
- Create: `src/lib/routing.ts`, `src/lib/routing.test.ts`

**Interfaces:**
- Consumes: `LatLng`, `RouteResult` from `types.ts`; `haversineM` from `geo.ts`
- Produces:
  - `greatCircleRoute(from: LatLng, to: LatLng, avgKmh?: number): RouteResult` — `avgKmh` default 70; polyline = 64 interpolated points; `approximate: true`
  - `osrmRoute(from: LatLng, to: LatLng, baseUrl: string, fetchFn?: typeof fetch): Promise<RouteResult>` — GET `${baseUrl}/route/v1/driving/{fromLng},{fromLat};{toLng},{toLat}?overview=full&geometries=geojson`; maps GeoJSON coords to `LatLng[]`; `approximate: false`
  - `getRoute(from: LatLng, to: LatLng, baseUrl: string, fetchFn?: typeof fetch): Promise<RouteResult>` — tries `osrmRoute`, on any throw/non-`Ok` returns `greatCircleRoute`

- [ ] **Step 1: `src/lib/routing.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { greatCircleRoute, getRoute } from './routing'

const A = { lat: 40.7, lng: -74.0 }
const B = { lat: 40.8, lng: -73.9 }

describe('greatCircleRoute', () => {
  it('is marked approximate and has endpoints', () => {
    const r = greatCircleRoute(A, B)
    expect(r.approximate).toBe(true)
    expect(r.polyline[0]).toEqual(A)
    expect(r.polyline.at(-1)).toEqual(B)
    expect(r.distanceM).toBeGreaterThan(0)
    expect(r.durationS).toBeGreaterThan(0)
  })
})

describe('getRoute', () => {
  it('falls back to great-circle when OSRM fails', async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any
    const r = await getRoute(A, B, 'https://example.invalid', failing)
    expect(r.approximate).toBe(true)
  })
  it('uses OSRM geometry on success', async () => {
    const ok = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ distance: 1234, duration: 90, geometry: { coordinates: [[-74, 40.7], [-73.9, 40.8]] } }] }),
    }) as any
    const r = await getRoute(A, B, 'https://ok', ok)
    expect(r.approximate).toBe(false)
    expect(r.distanceM).toBe(1234)
    expect(r.polyline).toEqual([{ lat: 40.7, lng: -74 }, { lat: 40.8, lng: -73.9 }])
  })
})
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement `src/lib/routing.ts`.** `DEFAULT_ROUTING_BASE_URL = 'https://routing.openstreetmap.de/routed-car'` exported.
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat: add routing adapter with great-circle fallback`

---

### Task 7: `geocode.ts` — Nominatim with cache

**Files:**
- Create: `src/lib/geocode.ts`, `src/lib/geocode.test.ts`

**Interfaces:**
- Consumes: `LatLng`
- Produces:
  - `geocode(query: string, fetchFn?: typeof fetch): Promise<{ label: string; coord: LatLng } | null>` — GET `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=...`; caches by normalized query in a module `Map` and `localStorage` (`lmw:geocode:<q>`); returns null on empty results
  - `suggest(query: string, fetchFn?: typeof fetch): Promise<Array<{ label: string; coord: LatLng }>>` — `limit=5`, for autocomplete
  - `reverseGeocode(coord: LatLng, fetchFn?: typeof fetch): Promise<string | null>` — `/reverse`, best-effort label

- [ ] **Step 1: `src/lib/geocode.test.ts`** — mock `fetch`; assert (a) a hit returns `{label, coord}`, (b) empty array returns `null`, (c) a second identical call does NOT call `fetchFn` again (cache).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { geocode } from './geocode'

beforeEach(() => localStorage.clear())

it('parses the first result and caches it', async () => {
  const f = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ display_name: 'Paris, France', lat: '48.8566', lon: '2.3522' }],
  }) as any
  const a = await geocode('paris', f)
  expect(a).toEqual({ label: 'Paris, France', coord: { lat: 48.8566, lng: 2.3522 } })
  await geocode('paris', f)
  expect(f).toHaveBeenCalledTimes(1)
})

it('returns null on no match', async () => {
  const f = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as any
  expect(await geocode('zzzznowhere', f)).toBeNull()
})
```

- [ ] **Step 2:** Add `environment: 'jsdom'` for this file or switch the Vitest `test.environment` to `'jsdom'` and install `jsdom` as a devDep (needed for `localStorage`). Update `package.json` + `vite.config.ts`.
- [ ] **Step 3: Run — expect FAIL**
- [ ] **Step 4: Implement `src/lib/geocode.ts`**
- [ ] **Step 5: Run — expect PASS**
- [ ] **Step 6: Commit** `feat: add Nominatim geocoding with cache`

---

### Task 8: `weather.ts` — batched Open-Meteo

**Files:**
- Create: `src/lib/weather.ts`, `src/lib/weather.test.ts`

**Interfaces:**
- Consumes: `Checkpoint`
- Produces:
  - `attachWeather(checkpoints: Checkpoint[], fetchFn?: typeof fetch): Promise<Checkpoint[]>` — issues ONE request per distinct rounded `(lat,lng)` OR uses Open-Meteo's multi-point support by passing comma-joined `latitude`/`longitude` lists; requests `hourly=temperature_2m,precipitation`; for each checkpoint picks the hour nearest `etaISO`; sets `weather` and leaves `hazard` untouched (schedule step applies the rule after). On fetch failure returns the input unchanged (weather stays undefined).
  - `weatherIcon(precipMm: number): string` — `precipMm > 0 ? '🌧️' : '☀️'` (port the existing helper's thresholds)

- [ ] **Step 1: `src/lib/weather.test.ts`** — mock fetch returning an `hourly` block; assert nearest-hour selection and that a rejected fetch yields checkpoints with `weather === undefined`.
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat: add batched Open-Meteo weather lookup`

---

### Task 9: `calculate.ts` — orchestrator + `store.tsx`

**Files:**
- Create: `src/lib/calculate.ts`, `src/lib/calculate.test.ts`, `src/store.tsx`

**Interfaces:**
- Consumes: everything in `lib/`
- Produces:
  - `calculateTrip(input: { from: string; to: string; intervalMin: number; startISO?: string }, settings: Settings, deps?: Partial<Deps>): Promise<{ route: RouteResult; checkpoints: Checkpoint[]; warnings: string[] }>` — geocode both (throws `GeocodeError` with which field failed), `getRoute`, `sampleCheckpoints`, `attachWeather`, apply `isHazardous` per checkpoint; `warnings` includes `'routing-approximate'` when `route.approximate`, `'weather-unavailable'` when any checkpoint lacks weather.
  - `store.tsx`: `AppProvider`, `useApp()` returning `{ state, dispatch }`; state = `{ status: 'idle'|'loading'|'done'|'error'; route?; checkpoints; warnings; error?; hoveredId?; recent: RecentRoute[]; settings: Settings }`. Reducer actions: `RUN_START`, `RUN_OK`, `RUN_ERR`, `HOVER`, `SET_SETTINGS`, `ADD_RECENT`, `LOAD_PERSISTED`. `settings` and `recent` persisted to `localStorage` (`lmw:settings`, `lmw:recent`).

- [ ] **Step 1: `calculate.test.ts`** — inject fake deps (geocode/getRoute/attachWeather) and assert: hazard flags applied, `warnings` contains `routing-approximate` when the fake route is approximate, `GeocodeError` names the missing field.
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement `calculate.ts` then `store.tsx`** (store has no unit test — exercised via components).
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** `feat: add trip orchestrator and app store`

---

### Task 10: MapView

**Files:**
- Create: `src/components/MapView/MapView.tsx`, `RouteLine.tsx`, `CheckpointMarkers.tsx`, `HazardSegments.tsx`, `src/components/MapView/index.ts`
- Modify: `src/App.tsx` (mount `<MapView/>` in `.map-pane`), `src/main.tsx` (import `leaflet/dist/leaflet.css`)

**Interfaces:**
- Consumes: `useApp()` — `state.route`, `state.checkpoints`, `state.hoveredId`, `dispatch(HOVER)`
- Produces: a `MapContainer` with OSM tiles; `RouteLine` draws `state.route.polyline` (dashed + amber tint when `route.approximate`); `CheckpointMarkers` renders a marker per checkpoint (hazard markers use the amber icon, larger when `id === hoveredId`), popup shows label/ETA/weather; `HazardSegments` overlays red polylines between consecutive hazardous checkpoints; auto-`fitBounds` to the polyline on route change.

- [ ] **Step 1:** Build components. Fix the known Leaflet marker-icon bundling issue by importing the icon PNGs from `leaflet/dist/images/*` and setting `L.Icon.Default.mergeOptions` (or use `divIcon`).
- [ ] **Step 2: Manual verify** — `npm run dev`, paste a `?from=&to=` URL after Task 12, confirm route + markers + fitBounds. Until then, temporarily hardcode a `RouteResult` in `App.tsx` to see it render, then remove.
- [ ] **Step 3: Commit** `feat: add interactive map with route, checkpoints, hazard segments`

---

### Task 11: Sidebar

**Files:**
- Create under `src/components/Sidebar/`: `Sidebar.tsx`, `SearchField.tsx`, `IntervalControl.tsx`, `SummaryStats.tsx`, `ScheduleList.tsx`, `RecentRoutes.tsx`, `index.ts`
- Create: `src/lib/format.ts` (+ `format.test.ts`) — `formatDistance(m, units)`, `formatTemp(c, units)`, `formatClock(iso)`, `formatOffset(min)`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useApp()`, `suggest` from `geocode.ts`, `calculateTrip` via `dispatch`
- Produces:
  - `SearchField` — controlled input, 400ms-debounced `suggest()` dropdown, keyboard up/down/enter/esc, selecting fills the field
  - `IntervalControl` — number input 5..240 step 5, default 30
  - a "Calculate" button → dispatches `RUN_START`, calls `calculateTrip`, dispatches `RUN_OK`/`RUN_ERR`, pushes `ADD_RECENT`, updates `window.history.replaceState` with `encodeRoute`
  - `SummaryStats` — distance / duration / checkpoint count / hazard count tiles (monospace numerals)
  - `ScheduleList` — one row per checkpoint; hazard rows get the amber left-border; `onMouseEnter`/`focus` → `dispatch(HOVER, id)`; shows "weather unavailable" when `weather` undefined
  - `RecentRoutes` — last 10 from `state.recent`, click re-runs

- [ ] **Step 1:** `format.ts` + tests first (TDD), then components.
- [ ] **Step 2: Run** `npm test -- format` — PASS
- [ ] **Step 3: Manual verify** the full happy path in `npm run dev` with a real location pair.
- [ ] **Step 4: Commit** `feat: add sidebar — search, interval, summary, schedule, recents`

---

### Task 12: App wiring, URL auto-run, ErrorBanner, responsive

**Files:**
- Modify: `src/App.tsx`, `src/styles/theme.css`
- Create: `src/components/ErrorBanner.tsx`, `src/components/ThemeToggle.tsx`

**Interfaces:**
- Produces:
  - on mount: `decodeRoute(location.search)`; if non-null, prefill and auto-run
  - `LOAD_PERSISTED` dispatched on mount (settings, recent, theme)
  - `ErrorBanner` — shows `state.error` (geocode failure) and warning banners for `routing-approximate` / `weather-unavailable`
  - `ThemeToggle` — flips `settings.theme`, writes `data-theme` on `<html>`, persists
  - CSS: sidebar is a fixed 340px column ≥900px; below that it's a slide-over drawer with a hamburger toggle; map is always full-bleed behind it

- [ ] **Step 1:** implement, **Step 2:** manual verify mobile (devtools responsive) + a shared URL loads and auto-runs, **Step 3: Commit** `feat: URL auto-run, theming, error banners, responsive layout`

---

### Task 13: `export.ts` + export buttons

**Files:**
- Create: `src/lib/export.ts`, `src/lib/export.test.ts`, `src/components/Sidebar/ExportMenu.tsx`
- Modify: `src/components/Sidebar/Sidebar.tsx`

**Interfaces:**
- Consumes: `Checkpoint[]`, `RouteResult`
- Produces:
  - `toJSON(checkpoints, route): string`
  - `toCSV(checkpoints): string` — header `time,label,kind,tempC,precipMm,hazard`
  - `toICS(checkpoints): string` — one `VEVENT` per checkpoint, `DTSTART` from `etaISO`, summary includes weather + ⚠ when hazard; valid `VCALENDAR` wrapper with `PRODID`
  - `downloadText(filename: string, mime: string, body: string): void` — Blob + object URL + click
  - map PNG: `ExportMenu` calls `leaflet-image`? NO — avoid the dep. Use `map.getContainer()` + the browser's built-in: document that "Save map as image" opens the browser's screenshot or right-click-save on the tiles is out of scope; instead export a **static OSM map URL** — `toStaticMapUrl(route)` building a `staticmap` link is also a dep/service. **Decision: PNG export is cut** — JSON/CSV/ICS only. (Update the spec's "map-PNG" mention.)

- [ ] **Step 1:** `export.test.ts` — assert CSV header + a hazard row, ICS has matching `BEGIN/END:VEVENT` counts and a `DTSTART`, JSON round-trips via `JSON.parse`.
- [ ] **Step 2: Run — expect FAIL**, **Step 3: Implement**, **Step 4: Run — expect PASS**
- [ ] **Step 5:** wire `ExportMenu` (three buttons), manual verify a download.
- [ ] **Step 6: Commit** `feat: add JSON/CSV/ICS schedule export`

---

### Task 14: SettingsDrawer

**Files:**
- Create: `src/components/SettingsDrawer.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useApp()` — `state.settings`, `dispatch(SET_SETTINGS)`
- Produces: a drawer with: hazard temperature threshold (number, °C or °F per units), routing base URL (text, default `DEFAULT_ROUTING_BASE_URL`, "reset" link), units toggle (metric/imperial), theme toggle. Changes persist immediately. A note lists the three upstream services + links to their usage policies (keeps the open-data credit visible).

- [ ] **Step 1:** implement, **Step 2:** manual verify changing the threshold re-flags the current schedule (recompute on settings change or show a "recalculate" hint — recompute), **Step 3: Commit** `feat: add settings drawer (threshold, routing URL, units, theme)`

---

### Task 15: Python CLI refactor into `cli/`

**Files:**
- Create: `cli/__init__.py`, `cli/__main__.py`, `cli/geocode.py`, `cli/routing.py`, `cli/weather.py`, `cli/schedule.py`, `cli/hazard.py`
- Create: `tests/test_hazard.py`, `tests/test_schedule.py`
- Delete: `route_calculator.py`
- Create: `requirements.txt` (just `requests`), `requirements-dev.txt` (`pytest`)

**Interfaces:**
- Produces:
  - `cli.hazard.is_hazardous(temp_c, precip_mm, threshold_c) -> bool` — same rule
  - `cli.schedule.sample_checkpoints(polyline, distance_m, duration_s, start, interval_min, origin_label, dest_label) -> list[dict]` — mirrors the TS shape
  - `cli.routing.get_route(from_pt, to_pt, base_url) -> dict` with great-circle fallback (`cli.routing.great_circle_route`)
  - `cli.geocode.geocode(query) -> dict | None`, `cli.weather.get_forecast(checkpoints) -> list[dict]`
  - `python -m cli` runs the interactive prompt loop (origin, destination, interval), prints the route summary + schedule table to stdout. **No HTML output.**

- [ ] **Step 1: `tests/test_hazard.py`**

```python
from cli.hazard import is_hazardous

def test_cold_and_wet():
    assert is_hazardous(4, 0.3, 25) is True

def test_cold_and_dry():
    assert is_hazardous(4, 0, 25) is False

def test_threshold_inclusive():
    assert is_hazardous(25, 1, 25) is True
```

- [ ] **Step 2: `tests/test_schedule.py`** — a 60-min straight route with `interval_min=30` yields 3 checkpoints, first offset 0, last offset 60.
- [ ] **Step 3: Run — expect FAIL** (`pip install -r requirements-dev.txt` first)

Run: `python -m pytest tests/ -v`

- [ ] **Step 4:** Port the logic from `route_calculator.py` (git history) into the modules. Reuse the existing haversine / interpolation / OSRM parsing code — it already works; just split and add the fallback.
- [ ] **Step 5: Run — expect PASS**. Also run `python -m cli` once by hand with a real pair.
- [ ] **Step 6: `git rm route_calculator.py`**
- [ ] **Step 7: Commit** `refactor: split Python CLI into cli/ package, drop HTML output`

---

### Task 16: GitHub Pages workflow + README + cleanup

**Files:**
- Modify: `.github/workflows/` — replace the Jekyll workflow with a Vite build-and-deploy
- Rewrite: `README.md`
- Delete: any remaining `route_map.html`, `route_data.json` if committed; `SETUP.md` review

**Interfaces:**
- Produces: on push to `main` (and this branch for preview if desired), `npm ci && npm run build`, upload `dist/`, deploy to Pages.

- [ ] **Step 1: Replace the workflow**

```yaml
name: Deploy to GitHub Pages
on:
  push: { branches: ["main"] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: "pages", cancel-in-progress: false }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: "npm" }
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: "dist" }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Rewrite `README.md`** — what it is, live URL, "run locally" (`npm install && npm run dev`), "the CLI" (`pip install -r requirements.txt && python -m cli`), the three upstream services + attribution, MIT, contributing. Fix the old `yourusername` clone URL.
- [ ] **Step 3:** `npm run build && npm run preview`, click through once.
- [ ] **Step 4: Commit** `ci: build and deploy Vite app to Pages; rewrite README`

---

## Self-Review

**Spec coverage:**
- Client-side, no keys, no backend — Tasks 1, 6, 7, 8 ✓
- Vite/React/TS, leaflet from npm, self-hosted fonts — Task 1 ✓
- Layout A (sidebar + map), responsive — Tasks 10, 11, 12 ✓
- Co-driver theme + light variant + toggle — Tasks 1, 12, 14 ✓
- Autocomplete — Task 11 ✓
- Map upgrades (route, markers, hazard segments, fitBounds, popups) — Task 10 ✓
- Live schedule panel, hover↔pin sync — Tasks 9 (hoveredId), 10, 11 ✓
- localStorage recent routes + shareable URL — Tasks 5, 9, 11, 12 ✓
- Export — Task 13 ✓ **(map-PNG cut — noted, spec to be updated)**
- Settings drawer (threshold, routing URL, units) — Task 14 ✓
- Routing pluggable + great-circle fallback + banner — Tasks 6, 12 ✓
- Error handling table — Tasks 9, 12 ✓
- Python CLI refactored into `cli/`, HTML output dropped — Task 15 ✓
- Vitest + pytest — throughout; Task 15 for pytest ✓
- Pages workflow build step — Task 16 ✓
- Jekyll removed — Task 1 ✓

**Deviation from spec:** map-image export dropped in Task 13 (would need a dependency or a third-party static-map service, both against Global Constraints). JSON/CSV/ICS retained. Update the spec's section 1 / feature list accordingly during Task 13.

**Type consistency:** `LatLng` uses `lng` (not `lon`) everywhere in TS; Nominatim's `lon` is mapped at parse sites (Tasks 6, 7). `Checkpoint.hazard` is always set (default false in Task 4, updated in Task 9). `getRoute` signature `(from, to, baseUrl, fetchFn?)` consistent between Tasks 6 and 9.

**Placeholder scan:** none — every code step has concrete content or names a prior task's git history as the source (Task 15 port).
