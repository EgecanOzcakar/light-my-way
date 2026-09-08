"""Nominatim geocoding — mirrors src/lib/geocode.ts (no persistent cache in the CLI)."""

from __future__ import annotations

from functools import lru_cache

import requests

from .geo import Point

NOMINATIM = "https://nominatim.openstreetmap.org"
USER_AGENT = "LightMyWay-CLI/1.0 (https://github.com/EgecanOzcakar/light-my-way)"
TIMEOUT = 8


@lru_cache(maxsize=128)
def geocode(query: str) -> tuple[str, Point] | None:
    """Return (label, (lat, lng)) for the top match, or None."""
    try:
        resp = requests.get(
            f"{NOMINATIM}/search",
            params={"format": "jsonv2", "limit": 1, "q": query},
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        rows = resp.json()
    except requests.RequestException:
        return None
    if not rows:
        return None
    row = rows[0]
    return row["display_name"], (float(row["lat"]), float(row["lon"]))
