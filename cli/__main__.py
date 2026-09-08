"""Interactive route weather & hazard planner.

    python -m cli

Prompts for an origin, destination and checkpoint interval, then prints the
route summary and a schedule of weather + hazard conditions along the way.
Uses only free, keyless public services (Nominatim, OSRM, Open-Meteo).
"""

from __future__ import annotations

from datetime import datetime

from .geocode import geocode
from .hazard import is_hazardous
from .routing import DEFAULT_ROUTING_BASE_URL, get_route
from .schedule import sample_checkpoints
from .weather import attach_weather

HAZARD_THRESHOLD_C = 25
DEFAULT_INTERVAL = 30


def _prompt() -> tuple[str, str, int]:
    origin = input("Origin (e.g. 'Times Square, New York'): ").strip()
    destination = input("Destination (e.g. 'Central Park, New York'): ").strip()
    raw = input(f"Interval in minutes (default {DEFAULT_INTERVAL}): ").strip()
    try:
        interval = int(raw) if raw else DEFAULT_INTERVAL
    except ValueError:
        print(f"Invalid interval, using {DEFAULT_INTERVAL}.")
        interval = DEFAULT_INTERVAL
    return origin, destination, max(5, min(240, interval))


def main() -> int:
    print("\n--- Light My Way — route weather & hazards ---")
    print("Public demo services (Nominatim / OSRM / Open-Meteo); respect their usage policies.\n")

    origin, destination, interval = _prompt()
    if not origin or not destination:
        print("Origin and destination cannot be empty.")
        return 1

    o = geocode(origin)
    d = geocode(destination)
    if not o:
        print(f"Could not find a location for '{origin}'.")
        return 1
    if not d:
        print(f"Could not find a location for '{destination}'.")
        return 1

    route = get_route(o[1], d[1], DEFAULT_ROUTING_BASE_URL)
    checkpoints = attach_weather(
        sample_checkpoints(route, datetime.now().astimezone(), interval, o[0], d[0])
    )
    for cp in checkpoints:
        if "temp_c" in cp:
            cp["hazard"] = is_hazardous(cp["temp_c"], cp["precip_mm"], HAZARD_THRESHOLD_C)

    hazards = sum(1 for cp in checkpoints if cp.get("hazard"))
    print(f"\nOrigin:      {o[0]}")
    print(f"Destination: {d[0]}")
    print(f"Distance:    {route.distance_m / 1000:.1f} km")
    print(f"Duration:    {route.duration_s / 60:.0f} min")
    if route.approximate:
        print("NOTE: routing unavailable — distances are straight-line approximations.")
    print(f"Checkpoints: {len(checkpoints)} ({hazards} hazardous)\n")

    for cp in checkpoints:
        when = cp["eta"].strftime("%a %H:%M")
        offset = "start" if cp["offset_min"] == 0 else f"+{cp['offset_min']} min"
        if "temp_c" in cp:
            weather = f"{cp['icon']} {cp['temp_c']:.0f}°C, {cp['precip_mm']} mm"
        else:
            weather = "weather unavailable"
        flag = "  ⚠ HAZARD" if cp.get("hazard") else ""
        print(f"  {when} ({offset:>9})  {cp['label']}")
        print(f"      {weather}{flag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
