"""Routing with a great-circle fallback — mirrors src/lib/routing.ts."""

from __future__ import annotations

from dataclasses import dataclass

import requests

from .geo import Point, haversine_m

DEFAULT_ROUTING_BASE_URL = "https://routing.openstreetmap.de/routed-car"
FALLBACK_AVG_KMH = 70
FALLBACK_POINTS = 64
REQUEST_TIMEOUT = 12


@dataclass
class RouteResult:
    polyline: list[Point]
    distance_m: float
    duration_s: float
    approximate: bool


def great_circle_route(a: Point, b: Point, avg_kmh: float = FALLBACK_AVG_KMH) -> RouteResult:
    polyline = [
        (a[0] + (b[0] - a[0]) * (i / FALLBACK_POINTS), a[1] + (b[1] - a[1]) * (i / FALLBACK_POINTS))
        for i in range(FALLBACK_POINTS + 1)
    ]
    distance_m = haversine_m(a, b)
    return RouteResult(polyline, distance_m, (distance_m / 1000 / avg_kmh) * 3600, True)


def osrm_route(a: Point, b: Point, base_url: str) -> RouteResult:
    coords = f"{a[1]},{a[0]};{b[1]},{b[0]}"
    url = f"{base_url.rstrip('/')}/route/v1/driving/{coords}?overview=full&geometries=geojson"
    resp = requests.get(url, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    routes = resp.json().get("routes") or []
    if not routes:
        raise ValueError("routing: no route in response")
    route = routes[0]
    polyline = [(lat, lng) for lng, lat in route["geometry"]["coordinates"]]
    return RouteResult(polyline, route["distance"], route["duration"], False)


def get_route(a: Point, b: Point, base_url: str = DEFAULT_ROUTING_BASE_URL) -> RouteResult:
    try:
        return osrm_route(a, b, base_url)
    except (requests.RequestException, ValueError, KeyError):
        return great_circle_route(a, b)
