"""Distance and interpolation helpers — mirrors src/lib/geo.ts.

Points are (lat, lng) tuples throughout.
"""

from __future__ import annotations

import math

EARTH_RADIUS_M = 6_371_000.0

Point = tuple[float, float]


def haversine_m(a: Point, b: Point) -> float:
    d_lat = math.radians(b[0] - a[0])
    d_lng = math.radians(b[1] - a[1])
    s = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(s)))


def cumulative_distances_m(points: list[Point]) -> list[float]:
    out = [0.0]
    for i in range(1, len(points)):
        out.append(out[i - 1] + haversine_m(points[i - 1], points[i]))
    return out


def interpolate_along(points: list[Point], cum_m: list[float], target_m: float) -> Point:
    if not points:
        raise ValueError("interpolate_along: empty polyline")
    if target_m <= 0:
        return points[0]
    total = cum_m[-1]
    if target_m >= total:
        return points[-1]
    i = 1
    while i < len(cum_m) and cum_m[i] < target_m:
        i += 1
    seg_start = cum_m[i - 1]
    seg_len = (cum_m[i] - seg_start) or 1.0
    t = (target_m - seg_start) / seg_len
    return (
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
    )
