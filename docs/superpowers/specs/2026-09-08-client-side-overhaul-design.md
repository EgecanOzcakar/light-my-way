# Light My Way — client-side overhaul design

Date: 2026-09-08
Status: approved (brainstorm)

## Goal

Turn the project from "Python CLI that emits a JSON file + a dead static HTML
demo" into a working, fully client-side web app hosted on GitHub Pages. Preserve
all current functionality and the open-source / no-keys / no-backend philosophy.

## Decisions

- **Runs fully client-side.** Browser calls Nominatim, OSRM, Open-Meteo directly
  (all keyless, CORS-enabled). No server.
- **Stack:** Vite + React 18 + TypeScript. `leaflet` + `react-leaflet` from npm
  (removes the `unpkg` CDN dependency). Fonts self-hosted (removes Google Fonts
  request).
- **Layout:** persistent left sidebar (inputs, summary stats, full schedule,
  recent routes) + map fills the rest. Sidebar collapses to a drawer on mobile.
- **Visual direction:** "Co-driver" — dark slate, monospace numerics, amber
  hazard accents. Ships a light variant too. Theme toggle, persisted.
- **Python CLI kept and refactored** (see below).
- **Jekyll removed** (`_config.yml`, `jekyll-theme-minimal`). Old `index.html`
  and the `route_data.json` file-handoff path deleted — the app replaces them.

## Repo shape

```
src/
  main.tsx, App.tsx
  lib/
    geocode.ts     Nominatim search + reverse; localStorage cache
    routing.ts     provider adapter; FOSSGIS OSRM default; great-circle fallback
    weather.ts     Open-Meteo; ONE batched call for all checkpoints
    schedule.ts    interval sampling, cumulative distance
    hazard.ts      isHazardous(tempC, precipMm, thresholdC)
    export.ts      JSON / CSV / ICS / map-PNG
    url.ts         encode/decode route <-> ?from=&to=&interval=
    store.ts       typed app state (React context + reducer)
  components/
    Sidebar/       SearchField (autocomplete), IntervalControl, SummaryStats,
                   ScheduleList, RecentRoutes
    MapView/       RouteLine, CheckpointMarkers, HazardSegments
    SettingsDrawer, ThemeToggle, ErrorBanner
  types.ts         Checkpoint, RouteResult, Provider, Settings
index.html         Vite entry
.github/workflows/ build -> publish dist/
cli/
  __main__.py, geocode.py, routing.py, weather.py, schedule.py, hazard.py
```

## Data flow

`Calculate` -> geocode from+to -> `routing.getRoute()` -> `schedule.sample()`
builds checkpoints at the chosen interval -> `weather.getForecast()` (one batched
Open-Meteo request for all checkpoint coords/times) -> merge -> `hazard` flags
each checkpoint -> state update -> map + schedule render.

Schedule row hover/click <-> map pin highlight via a shared `hoveredId` in the
store. Each successful result is appended to `RecentRoutes` (localStorage, cap
10) and encoded into the URL query string for sharing. On load, if the URL
carries `from/to/interval`, auto-run.

## Routing adapter (removes the OSRM single point of failure)

```ts
interface Provider {
  name: string
  getRoute(from: LatLng, to: LatLng): Promise<{ polyline: LatLng[]; distanceM: number; durationS: number }>
}
```

- `osrmProvider(baseUrl)` — default `https://routing.openstreetmap.de/routed-car`
  (FOSSGIS community instance; same OSRM API, far better uptime than
  `router.project-osrm.org`). Base URL editable in Settings.
- `greatCircleProvider` — fallback. Straight-line polyline with interpolated
  points, `distanceM` via haversine, `durationS` via assumed average speed
  (configurable constant). Used automatically on any provider error.
- When the fallback is used, a persistent banner says
  "Routing unavailable — showing approximate straight-line path." Schedule,
  weather and hazard detection all still work off the fallback polyline.

## Error handling

| Stage | Failure | Behavior |
|-------|---------|----------|
| Geocode | no match | inline field error, no calculation |
| Geocode/route/weather | 429 | backoff, retry once, then message |
| Routing | any error | great-circle fallback + banner |
| Weather | any error | checkpoints render "weather unavailable", no hazard flags |

No failure produces a blank screen.

## Python CLI

Split `route_calculator.py` into a `cli/` package mirroring the TS lib:
`geocode.py`, `routing.py`, `weather.py`, `schedule.py`, `hazard.py`, and
`__main__.py` for the interactive prompt loop. Same routing default and
great-circle fallback. **Delete** `generate_map_html` and the `route_data.json`
writer. `requests` stays the only dependency. Run with `python -m cli`.

## Testing

- Vitest unit tests: `schedule`, `hazard`, `routing` fallback, `url` codec,
  `export` formats. (Pure functions; the parts most likely to regress.)
- `pytest`: mirrored Python `schedule` and `hazard`.
- No component-render or E2E harness — out of scope for a solo hobby app; add
  later if the app grows.

## Preserved

Geocode -> route -> interval schedule -> weather -> hazard -> interactive map.
Zero API keys, zero backend, free public services, MIT license, hostable by
copying `dist/`. The GitHub Pages URL becomes a working app.

## Out of scope

Trip optimization, multi-stop routes, turn-by-turn directions, accounts,
server-side anything, offline/PWA, alternative transport modes.
