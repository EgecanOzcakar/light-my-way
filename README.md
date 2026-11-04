# Light My Way

Plan a drive and see the **weather and hazardous conditions along the route**,
checkpoint by checkpoint — on an interactive map, in your browser, with no
account and no API keys.

**Live app:** https://egecanozcakar.github.io/light-my-way/

![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)

---

## What it does

- Geocodes an origin and destination (Nominatim / OpenStreetMap)
- Fetches a driving route (OSRM)
- Samples the route at a fixed time interval (every 30 min by default)
- Attaches an hourly weather forecast to each checkpoint (Open-Meteo)
- Flags **hazards** per checkpoint: ice (≤ 0 °C with precipitation), snowfall,
  strong gusts, low visibility and heavy rain (thresholds in `src/lib/hazard.ts`)
- Departure-time picker; **best time to leave** compares departures over the next 12 h (Pro)
- Hazard alerts summary (Pro); trips ending more than 24 h out are Pro
- Draws the route, checkpoints and hazardous segments on a Leaflet map
- Shareable route links, recent-route history, and JSON / CSV / ICS export

All three upstream services are free and keyless. If routing is unavailable the
app falls back to a straight-line estimate so the weather schedule still works.

## Run it locally (web app)

```bash
npm install
npm run dev      # http://localhost:5173/light-my-way/
```

Other scripts: `npm test` (Vitest), `npm run build` (outputs `dist/`),
`npm run preview`.

The app is a static bundle — `npm run build` and host `dist/` anywhere.

## Configuration

Open **Settings** in the app to change:

- **Ice threshold** (default 0 °C)
- **Routing server** — any OSRM-compatible base URL; defaults to the FOSSGIS
  community instance (`routing.openstreetmap.de/routed-car`). Point it at your
  own OSRM if you self-host.
- **Units** (metric / imperial) and **theme** (dark / light)

Build-time service URLs (Vite env vars, e.g. in `.env.local`) — all optional,
defaulting to the public services below:

| Variable | Default |
| --- | --- |
| `VITE_GEOCODER_URL` | `https://nominatim.openstreetmap.org` |
| `VITE_ROUTER_URL` | `https://routing.openstreetmap.de/routed-car` |
| `VITE_WEATHER_URL` | `https://api.open-meteo.com/v1/forecast` |
| `VITE_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| `VITE_API_BASE` | unset — set to the proxy URL to route everything through `server/` |
| `VITE_TILE_SOURCE` / `VITE_PMTILES_URL` | `osm` — `pmtiles` for self-hosted Protomaps |

## Backend proxy (`server/`)

A dependency-free Node proxy (built-in `http` + `fetch`) that forwards geocode,
route, weather and tile requests, keeps provider keys server-side, caches
responses with a TTL and rate-limits per IP. Providers: Open-Meteo commercial,
Geoapify, Valhalla (truck costing). **With no keys set it serves mock data**
from `server/fixtures/`.

```bash
npm run server                                  # :8787, mock mode
VITE_API_BASE=http://localhost:8787 npm run dev
```

See **[SETUP.md](SETUP.md)** for every env var, fixture and what replaces it.

## Project layout

```
src/lib/      pure logic — geocode, routing, weather, schedule, hazard, url, export
src/components/  MapView, Sidebar, SettingsDrawer
server/       backend proxy, provider adapters, mock fixtures
docs/         design spec and implementation plan
```

## Data & attribution

- Geocoding — [Nominatim](https://nominatim.org/)
- Routing — [OSRM](https://project-osrm.org/) via
  [FOSSGIS](https://routing.openstreetmap.de/)
- Weather — [Open-Meteo](https://open-meteo.com/)
- Map tiles — [OpenStreetMap](https://www.openstreetmap.org/copyright)

Please respect each service's usage policy. The public demo servers are not for
high-volume or commercial use — production traffic goes through the proxy with
paid providers (see [SETUP.md](SETUP.md)).

## License

MIT
