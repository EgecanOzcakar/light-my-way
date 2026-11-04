import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useApp } from '../store'
import { formatClock, formatTemp } from '../lib/format'
import type { Checkpoint, Units } from '../types'

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const START_CENTER: [number, number] = [39.5, 34.9]

const cssVar = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

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

/** Popup body built from DOM text nodes — labels come from the geocoder, so no HTML strings. */
function popupContent(cp: Checkpoint, units: Units, hazard: string): HTMLElement {
  const el = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = cp.label
  el.append(title)
  const line = (text: string) => {
    el.append(document.createElement('br'), document.createTextNode(text))
  }
  line(`${formatClock(cp.etaISO)} (${cp.offsetMin === 0 ? 'start' : `+${cp.offsetMin} min`})`)
  if (cp.weather) line(`${cp.weather.icon} ${formatTemp(cp.weather.tempC, units)}, ${cp.weather.precipMm} mm`)
  if (cp.hazard) {
    const warn = document.createElement('span')
    warn.style.color = hazard
    warn.textContent = '⚠ hazardous conditions'
    el.append(document.createElement('br'), warn)
  }
  return el
}

export function MapView() {
  const { state, dispatch } = useApp()
  const { route, checkpoints, hoveredId } = state
  const { units, theme } = state.settings

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef(new Map<string, { marker: L.CircleMarker; cp: Checkpoint }>())

  // Create the map once.
  useEffect(() => {
    const map = L.map(containerRef.current!).setView(START_CENTER, 6)
    L.tileLayer(TILE_URL, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map)
    mapRef.current = map
    overlayRef.current = L.layerGroup().addTo(map)
    return () => {
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [])

  // Redraw route, hazard segments and checkpoint markers.
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.clearLayers()
    markersRef.current.clear()

    const accent = cssVar('--accent', '#7fd0ff')
    const hazard = cssVar('--hazard', '#ff8c42')
    const line = route?.polyline.map((p): [number, number] => [p.lat, p.lng]) ?? []

    if (line.length > 1) {
      L.polyline(line, {
        color: route?.approximate ? hazard : accent,
        weight: 4,
        dashArray: route?.approximate ? '8 8' : undefined,
      }).addTo(overlay)
    }
    for (const seg of hazardPairs(checkpoints)) {
      L.polyline(seg, { color: hazard, weight: 7, opacity: 0.9 }).addTo(overlay)
    }
    for (const cp of checkpoints) {
      const color = cp.hazard ? hazard : accent
      const marker = L.circleMarker([cp.coord.lat, cp.coord.lng], { color, fillColor: color })
        .bindPopup(popupContent(cp, units, hazard))
        .on('mouseover', () => dispatch({ type: 'HOVER', id: cp.id }))
        .on('mouseout', () => dispatch({ type: 'HOVER', id: undefined }))
        .addTo(overlay)
      markersRef.current.set(cp.id, { marker, cp })
    }
  }, [route, checkpoints, units, theme, dispatch])

  // Hover styling only — restyle in place so open popups survive.
  useEffect(() => {
    for (const [id, { marker, cp }] of markersRef.current) {
      const active = id === hoveredId
      marker.setRadius(active ? 11 : cp.kind === 'interval' ? 6 : 8)
      marker.setStyle({ fillOpacity: active ? 0.95 : 0.65, weight: active ? 3 : 1 })
    }
  }, [hoveredId, route, checkpoints, units, theme])

  // Fit the view to a new route.
  useEffect(() => {
    const map = mapRef.current
    if (map && route && route.polyline.length > 1) {
      map.fitBounds(L.latLngBounds(route.polyline.map((p) => [p.lat, p.lng])), { padding: [40, 40] })
    }
  }, [route])

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}
