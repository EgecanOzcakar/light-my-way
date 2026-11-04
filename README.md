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
- Flags **hazardous** checkpoints — at or below 25 °C **and** with precipitation
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

- **Hazard temperature threshold** (default 25 °C)
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

## Project layout

```
src/lib/      pure logic — geocode, routing, weather, schedule, hazard, url, export
src/components/  MapView, Sidebar, SettingsDrawer
docs/         design spec and implementation plan
```

## Data & attribution

- Geocoding — [Nominatim](https://nominatim.org/)
- Routing — [OSRM](https://project-osrm.org/) via
  [FOSSGIS](https://routing.openstreetmap.de/)
- Weather — [Open-Meteo](https://open-meteo.com/)
- Map tiles — [OpenStreetMap](https://www.openstreetmap.org/copyright)

Please respect each service's usage policy. This is a hobby project — not for
high-volume or commercial use against the public demo servers.

## License

MIT
