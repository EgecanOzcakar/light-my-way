"""Open-Meteo weather lookup — mirrors src/lib/weather.ts."""

from __future__ import annotations

from datetime import datetime, timezone

import requests

from .hazard import weather_icon
from .schedule import Checkpoint

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
TIMEOUT = 10


def _nearest_hour_index(times: list[str], target: datetime) -> int:
    target_utc = target.astimezone(timezone.utc).replace(tzinfo=None)
    best, best_diff = 0, None
    for i, t in enumerate(times):
        diff = abs((datetime.fromisoformat(t) - target_utc).total_seconds())
        if best_diff is None or diff < best_diff:
            best, best_diff = i, diff
    return best


def attach_weather(checkpoints: list[Checkpoint]) -> list[Checkpoint]:
    """Fill temp_c / precip_mm / icon on each checkpoint. On failure, leaves them unset."""
    if not checkpoints:
        return checkpoints
    lat = ",".join(f"{c['coord'][0]:.4f}" for c in checkpoints)
    lng = ",".join(f"{c['coord'][1]:.4f}" for c in checkpoints)
    try:
        resp = requests.get(
            OPEN_METEO,
            params={
                "latitude": lat,
                "longitude": lng,
                "hourly": "temperature_2m,precipitation",
                "timezone": "UTC",
                "forecast_days": 3,
            },
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException:
        return checkpoints

    blocks = data if isinstance(data, list) else [data]
    for i, cp in enumerate(checkpoints):
        block = blocks[i] if i < len(blocks) else blocks[0]
        hourly = block.get("hourly") or {}
        times = hourly.get("time") or []
        if not times:
            continue
        h = _nearest_hour_index(times, cp["eta"])
        temp = hourly["temperature_2m"][h]
        precip = hourly["precipitation"][h]
        if temp is None or precip is None:
            continue
        cp["temp_c"] = temp
        cp["precip_mm"] = precip
        cp["icon"] = weather_icon(precip)
    return checkpoints
