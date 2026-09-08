"""Interval checkpoint sampling — mirrors src/lib/schedule.ts."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TypedDict

from .geo import Point, cumulative_distances_m, interpolate_along
from .routing import RouteResult


class Checkpoint(TypedDict, total=False):
    id: str
    label: str
    coord: Point
    eta: datetime
    offset_min: int
    cumulative_km: float
    kind: str  # 'origin' | 'interval' | 'destination'
    temp_c: float
    precip_mm: float
    icon: str
    hazard: bool


def sample_checkpoints(
    route: RouteResult,
    start: datetime,
    interval_min: int,
    origin_label: str,
    destination_label: str,
) -> list[Checkpoint]:
    total_min = route.duration_s / 60
    cum_m = cumulative_distances_m(route.polyline)
    total_km = route.distance_m / 1000

    offsets: list[float] = [0.0]
    t = float(interval_min)
    while t < total_min:
        offsets.append(t)
        t += interval_min
    offsets.append(total_min)

    checkpoints: list[Checkpoint] = []
    last = len(offsets) - 1
    for i, offset_min in enumerate(offsets):
        frac = offset_min / total_min if total_min > 0 else 0.0
        if i == 0:
            coord, kind, label = route.polyline[0], "origin", origin_label
        elif i == last:
            coord, kind, label = route.polyline[-1], "destination", destination_label
        else:
            coord = interpolate_along(route.polyline, cum_m, frac * route.distance_m)
            kind = "interval"
            label = f"Approx. location after {round(offset_min)} min"
        checkpoints.append(
            Checkpoint(
                id=f"cp-{i}",
                label=label,
                coord=coord,
                eta=start + timedelta(minutes=offset_min),
                offset_min=round(offset_min),
                cumulative_km=round(frac * total_km, 2),
                kind=kind,
                hazard=False,
            )
        )
    return checkpoints
