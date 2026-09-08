import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useApp } from '../store'
import { formatClock, formatTemp } from '../lib/format'
import type { Checkpoint } from '../types'

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const START_CENTER: [number, number] = [39.5, 34.9]

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
  }, [map, points])
  return null
}

function hazardPairs(checkpoints: Checkpoint[]): [number, number][][] {
  const segs: [number, number][][] = []
  for (let i = 1; i < checkpoints.length; i++) {
    if (checkpoints[i - 1].hazard && checkpoints[i].hazard) {
      segs.push([
        [checkpoints[i - 1].coord.lat, checkpoints[i - 1].coord.lng],
        [checkpoints[i].coord.lat, checkpoints[i].coord.lng],
      ])
    }
  }
  return segs
}

export function MapView() {
  const { state, dispatch } = useApp()
  const { route, checkpoints, hoveredId } = state

  const line = useMemo<[number, number][]>(
    () => route?.polyline.map((p) => [p.lat, p.lng]) ?? [],
    [route],
  )
  const hazardSegs = useMemo(() => hazardPairs(checkpoints), [checkpoints])
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7fd0ff'
  const hazard = getComputedStyle(document.documentElement).getPropertyValue('--hazard').trim() || '#ff8c42'

  return (
    <MapContainer center={START_CENTER} zoom={6} style={{ height: '100%', width: '100%' }}>
      <TileLayer url={OSM_URL} attribution={OSM_ATTR} maxZoom={19} />

      {line.length > 1 && (
        <Polyline
          positions={line}
          pathOptions={{
            color: route?.approximate ? hazard : accent,
            weight: 4,
            dashArray: route?.approximate ? '8 8' : undefined,
          }}
        />
      )}

      {hazardSegs.map((seg, i) => (
        <Polyline key={i} positions={seg} pathOptions={{ color: hazard, weight: 7, opacity: 0.9 }} />
      ))}

      {checkpoints.map((cp) => {
        const active = cp.id === hoveredId
        return (
          <CircleMarker
            key={cp.id}
            center={[cp.coord.lat, cp.coord.lng]}
            radius={active ? 11 : cp.kind === 'interval' ? 6 : 8}
            pathOptions={{
              color: cp.hazard ? hazard : accent,
              fillColor: cp.hazard ? hazard : accent,
              fillOpacity: active ? 0.95 : 0.65,
              weight: active ? 3 : 1,
            }}
            eventHandlers={{
              mouseover: () => dispatch({ type: 'HOVER', id: cp.id }),
              mouseout: () => dispatch({ type: 'HOVER', id: undefined }),
            }}
          >
            <Popup>
              <strong>{cp.label}</strong>
              <br />
              {formatClock(cp.etaISO)} ({cp.offsetMin === 0 ? 'start' : `+${cp.offsetMin} min`})
              {cp.weather && (
                <>
                  <br />
                  {cp.weather.icon} {formatTemp(cp.weather.tempC, state.settings.units)},{' '}
                  {cp.weather.precipMm} mm
                </>
              )}
              {cp.hazard && (
                <>
                  <br />
                  <span style={{ color: hazard }}>⚠ hazardous conditions</span>
                </>
              )}
            </Popup>
          </CircleMarker>
        )
      })}

      <FitBounds points={line} />
    </MapContainer>
  )
}
