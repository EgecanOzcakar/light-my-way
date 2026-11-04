# SETUP — replace-mock checklist

Everything below runs today on **mock data or public demo services**. This file
lists every env var, placeholder and fixture, and what replaces each one before
the app goes to paying fleet customers.

## How the pieces connect

```
browser (Vite app)  ──VITE_API_BASE──▶  server/ proxy  ──keys in env──▶  paid providers
        │                                    │
        └─ no VITE_API_BASE: public demo     └─ no key: fixtures in server/fixtures/ (MOCK DATA)
           services, plan = "free"
```

Run the proxy locally: `npm run server` (port 8787). Then start the app with
`VITE_API_BASE=http://localhost:8787 npm run dev`. With no keys set, the proxy
logs `MOCK DATA for: …`. Mock responses carry an `X-Mock-Data: true` header,
and `GET /health` shows which adapters are mocked. Mock geocoder labels start
with `[mock]`.

## Frontend (build-time, `VITE_*`)

| Variable | Today | Replace with |
| --- | --- | --- |
| `VITE_API_BASE` | unset, so the browser calls public services directly | the deployed proxy URL, e.g. `https://api.<your-domain>` |
| `VITE_GEOCODER_URL` | Nominatim, or `${VITE_API_BASE}/geocode` | normally leave unset once the proxy is used |
| `VITE_ROUTER_URL` | FOSSGIS OSRM, or `${VITE_API_BASE}` | normally leave unset |
| `VITE_WEATHER_URL` | public Open-Meteo, or `${VITE_API_BASE}/weather` | normally leave unset |
| `VITE_TILE_SOURCE` | `osm` | `pmtiles` once self-hosted tiles are live |
| `VITE_TILE_URL` | `tile.openstreetmap.org`, or `${VITE_API_BASE}/tiles/{z}/{x}/{y}.png` | a commercial raster tile URL, if PMTiles is not used |
| `VITE_PMTILES_URL` | unset | URL of your `.pmtiles` archive (see Tiles) |
| `VITE_TILE_ATTRIBUTION` | OSM, or Protomaps + OSM for pmtiles | the attribution your tile provider requires |

Note: a user's **Routing server** setting is saved in localStorage. A browser
that saved the old public URL keeps using it after `VITE_API_BASE` is set; the
user has to click "Reset to default" in Settings.

## Proxy (`server/`, runtime env)

| Variable | Default / mock | Replace with |
| --- | --- | --- |
| `PORT` | `8787` | your host's port |
| `CORS_ORIGIN` | `*` | the app's origin, e.g. `https://egecanozcakar.github.io` |
| `TRUST_PROXY` | unset | `1` behind a load balancer, so `X-Forwarded-For` is used for rate limiting |
| `RATE_LIMIT_PER_MIN` | `60` per IP (API routes) | tune per plan |
| `TILE_RATE_LIMIT_PER_MIN` | `600` per IP | tune |
| `OPEN_METEO_API_KEY` | unset, so **mock**: `fixtures/weather-day.json` | Open-Meteo commercial plan key (customer-api endpoint) |
| `OPEN_METEO_URL` | `https://customer-api.open-meteo.com/v1/forecast` | keep |
| `GEOAPIFY_API_KEY` | unset, so **mock**: `fixtures/geocode.json` (18 cities, others return no match) | Geoapify paid plan key; check its storage/caching terms against the 7-day proxy cache |
| `GEOAPIFY_URL` | `https://api.geoapify.com/v1/geocode/search` | keep |
| `ROUTER_API_KEY` | unset, so **mock**: synthetic path from `fixtures/route.json` | Stadia Maps (hosted Valhalla) key, or your own Valhalla |
| `ROUTER_URL` | `https://api.stadiamaps.com/route/v1` | your Valhalla `/route` endpoint, if self-hosted |
| `TRUCK_HEIGHT_M` / `TRUCK_WIDTH_M` / `TRUCK_LENGTH_M` / `TRUCK_WEIGHT_T` / `TRUCK_AXLE_LOAD_T` | 4.0 / 2.55 / 16.5 / 40 / 11.5 | per-fleet values; later per-vehicle from the account |
| `TILE_UPSTREAM_URL` | OSM tile server | a commercial tile provider; `{key}` is replaced with `TILE_API_KEY`. **Do not** proxy OSM in production: its tile policy forbids heavy use |
| `TILE_API_KEY`, `TILE_USER_AGENT` | unset / project UA | provider key, and your contact UA |
| `MOCK_PRO` | unset, so `/me` returns `free`; `1` returns `pro` for everyone | real accounts and billing (below) |

## Fixtures (all labelled `MOCK DATA` in their `_comment`)

- `server/fixtures/geocode.json`: replaced by `GEOAPIFY_API_KEY`.
- `server/fixtures/route.json`: replaced by `ROUTER_API_KEY`.
- `server/fixtures/weather-day.json`: replaced by `OPEN_METEO_API_KEY`. It contains
  deliberate ice, fog, snow, gust and heavy-rain hours so the hazard model and
  "best time to leave" have something to show.

Delete a fixture only after its key is set in **every** environment, including CI,
where the proxy tests exercise mock mode on purpose.

## Tiles (Protomaps PMTiles)

1. Build or download a basemap archive (`pmtiles extract` from the Protomaps daily build, limited to your region).
2. Host it on object storage with HTTP range requests and CORS enabled (S3/R2 + CDN).
3. Set `VITE_TILE_SOURCE=pmtiles` and `VITE_PMTILES_URL=https://…/basemap.pmtiles`.
   The renderer, `protomaps-leaflet` (BSD-3-Clause), loads only in this mode.
4. Attribution defaults to "Protomaps © OpenStreetMap". Keep it, since the data is ODbL.

## Billing / entitlements

- The limits live in `shared/plan.json` (the 24 h free horizon and the Pro feature list).
  `src/lib/entitlements.ts` (UI) and `server/plan.js` (enforcement) both read that file.
- Pro-only features: multi-day trips (the trip ends more than 24 h from now), best time to leave, and hazard alerts.
- The proxy enforces them: a `/weather` request whose window ends past the hour that contains
  now + 24 h (`end_hour`, `end_date` or `forecast_days`; Open-Meteo's default is 7 days), or that
  carries `feature=best-time`, returns `403 {"error":"pro_required","feature":…}` on the free plan.
  The app shows the upgrade message for it. Alerts are computed in the browser, so no endpoint serves them yet.
- Known gap: `feature=best-time` is a flag the client sends voluntarily. A free client that omits it
  gets at most a 24 h window, which is the free allowance anyway. Per-account quotas would close this gap.
- `server/plan.js` → `planFor()` is the one plan lookup, used by `/me` and by every check.
  To replace the mock: add auth (session/JWT) to the proxy, look up the customer's subscription
  there (e.g. Stripe customer → active price), and remove `MOCK_PRO`.

## Scaling notes (marked `ponytail:` in code)

- The proxy cache and rate limiter are per process and in memory. Move them to Redis when you run more than one instance.
