"""Hazard rule — kept identical to src/lib/hazard.ts."""


def is_hazardous(temp_c: float, precip_mm: float, threshold_c: float) -> bool:
    """Cold enough AND wet: at/below the threshold with some precipitation."""
    return temp_c <= threshold_c and precip_mm > 0


def weather_icon(precip_mm: float) -> str:
    return "🌧️" if precip_mm > 0 else "☀️"
