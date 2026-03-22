#!/usr/bin/env python3
"""
Car route calculator and map generator (OpenStreetMap / OSRM demo servers)

This script:
- Geocodes origin/destination using Nominatim (public)
- Requests a route from OSRM demo server (public)
- Interpolates approximate locations at regular time intervals based on route duration
- Generates an HTML file with a Leaflet map showing the route and interval markers
  and a schedule table with absolute times (start = current datetime)

This updated version improves marker popup behavior by:
- Importing and using `webbrowser` to open the generated HTML
- Setting `iconAnchor` and `popupAnchor` on Leaflet `divIcon`s so popups are positioned above icons
- Adding CSS with higher z-index for popups and ensuring pointer events are enabled
- Adding explicit click handlers that call `openPopup()` and raise the marker (z-index offset)
"""

import json
import math
import os
import webbrowser
from datetime import datetime, timedelta
from functools import lru_cache

import requests

# --- Configuration for public services ---
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
OSRM_URL = "http://router.project-osrm.org/route/v1/driving/"  # Public demo server
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
USER_AGENT = (
    "LightMyWay-RouteCalculator/1.0 (https://github.com/yourusername/light-my-way)"
)

# --- Weather and hazard thresholds ---
HAZARD_TEMP_THRESHOLD = 25  # °C
HAZARD_PRECIP_MIN = 0  # mm
LEAFLET_VERSION = "1.7.1"
DEFAULT_MAP_CENTER = (48.8566, 2.3522)  # Paris
DEFAULT_ZOOM = 10
DEFAULT_INTERVAL = 30  # minutes
MIN_INTERVAL = 1  # minutes
MAX_INTERVAL = 1440  # minutes (24 hours)
REQUEST_TIMEOUT = 12  # seconds (for OSRM)
REVERSE_GEOCODE_TIMEOUT = 6  # seconds
WEATHER_REQUEST_TIMEOUT = 10  # seconds


@lru_cache(maxsize=128)
def geocode(location_name):
    """
    Geocode a location name to (lat, lon) using Nominatim.
    Returns (lat, lon) or None on failure.
    """
    params = {"q": location_name, "format": "json", "limit": 1, "addressdetails": 0}
    headers = {"User-Agent": USER_AGENT}
    try:
        resp = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=6)
        resp.raise_for_status()
        data = resp.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
        print(f"INFO: No geocoding results for '{location_name}'")
        return None
    except requests.RequestException as e:
        print(f"ERROR: Geocoding failed for '{location_name}': {e}")
        return None


@lru_cache(maxsize=128)
def reverse_geocode(lat, lon):
    """
    Reverse geocode (lat, lon) to a display name using Nominatim.
    Returns a location string or None on failure.
    """
    params = {"lat": lat, "lon": lon, "format": "json", "addressdetails": 1}
    headers = {"User-Agent": USER_AGENT}
    try:
        resp = requests.get(
            NOMINATIM_REVERSE_URL, params=params, headers=headers, timeout=REVERSE_GEOCODE_TIMEOUT
        )
        resp.raise_for_status()
        data = resp.json()
        if data and "display_name" in data:
            # The display_name can be very long, so we try to get a shorter version
            address = data.get("address", {})
            road = address.get("road")
            city = address.get("city") or address.get("town") or address.get("village")
            state = address.get("state")
            country = address.get("country")

            parts = [part for part in [road, city, state, country] if part]
            if parts:
                return ", ".join(parts)
            return data["display_name"]
        return "Unknown location"
    except requests.RequestException as e:
        print(f"ERROR: Reverse geocoding failed for ({lat}, {lon}): {e}")
        return "Unknown location"


def is_hazardous(weather):
    """
    Determine if weather conditions are hazardous.
    Hazardous: temperature <= 25°C AND precipitation > 0mm
    """
    if not weather:
        return False
    return (
        weather["temperature"] <= HAZARD_TEMP_THRESHOLD
        and weather["precipitation"] > HAZARD_PRECIP_MIN
    )


def get_weather_icon(precipitation):
    """
    Returns a unicode character to represent the weather condition.
    """
    if precipitation is None:
        return ""
    if precipitation == 0:
        return "☀️"
    elif 0 < precipitation < 1:
        return "☁️"
    else:  # precipitation >= 1
        return "🌧️"


def get_weather_forecast(lat, lon, time_str):
    """
    Get weather forecast for a specific lat, lon, and time using Open-Meteo.
    Returns a dictionary with temperature, precipitation, and icon or None.
    """
    try:
        # The time_str is in format "%A, %Y-%m-%d %H:%M:%S"
        # The API needs YYYY-MM-DD
        dt_obj = datetime.strptime(time_str, "%A, %Y-%m-%d %H:%M:%S")
        date_str = dt_obj.strftime("%Y-%m-%d")

        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": "temperature_2m,precipitation",
            "start_date": date_str,
            "end_date": date_str,
        }
        headers = {"User-Agent": USER_AGENT}
        resp = requests.get(
            OPEN_METEO_URL, params=params, headers=headers, timeout=WEATHER_REQUEST_TIMEOUT
        )
        resp.raise_for_status()
        data = resp.json()

        if data and "hourly" in data:
            hour_index = dt_obj.hour
            temp = data["hourly"]["temperature_2m"][hour_index]
            precip = data["hourly"]["precipitation"][hour_index]
            weather = {"temperature": temp, "precipitation": precip}
            weather["icon"] = get_weather_icon(precip)
            return weather
        return None
    except (requests.RequestException, KeyError, IndexError, ValueError) as e:
        print(f"WARN: Could not fetch weather for ({lat}, {lon}) at {time_str}: {e}")
        return None


def haversine(lat1, lon1, lat2, lon2):
    """
    Haversine distance in meters.
    """
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _create_interval_point(
    elapsed_seconds, average_speed_mps, polyline_coords, cum_dist, start_time
):
    """
    Create a single interval location point.
    Returns dict with absolute_time, time_elapsed_minutes, location, description, weather, hazardous.
    """
    target_dist = average_speed_mps * elapsed_seconds

    # Find segment containing target distance
    loc = None
    if target_dist <= cum_dist[0]:
        loc = polyline_coords[0]
    else:
        for i in range(1, len(cum_dist)):
            if cum_dist[i] >= target_dist:
                prev_d = cum_dist[i - 1]
                curr_d = cum_dist[i]
                prev_pt = polyline_coords[i - 1]
                curr_pt = polyline_coords[i]
                seg_len = curr_d - prev_d
                if seg_len <= 0:
                    loc = prev_pt
                else:
                    frac = (target_dist - prev_d) / seg_len
                    lat = prev_pt[0] + frac * (curr_pt[0] - prev_pt[0])
                    lon = prev_pt[1] + frac * (curr_pt[1] - prev_pt[1])
                    loc = (lat, lon)
                break
        if loc is None:
            loc = polyline_coords[-1]

    address = reverse_geocode(loc[0], loc[1])
    time_at_loc_str = (
        start_time + timedelta(seconds=int(elapsed_seconds))
    ).strftime("%A, %Y-%m-%d %H:%M:%S")
    weather = get_weather_forecast(loc[0], loc[1], time_at_loc_str)
    if weather:
        weather["icon"] = get_weather_icon(weather["precipitation"])
    hazardous = is_hazardous(weather)

    return {
        "absolute_time": time_at_loc_str,
        "time_elapsed_minutes": int(elapsed_seconds / 60),
        "location": loc,
        "description": f"Approximate location after {int(elapsed_seconds / 60)} minutes: {address}",
        "weather": weather,
        "hazardous": hazardous,
    }


def _find_closest_polyline_index(location, polyline_coords):
    """
    Find the index of the closest point in polyline_coords to the given location.
    """
    min_dist = float("inf")
    closest_idx = -1
    for i, point in enumerate(polyline_coords):
        dist = haversine(
            location[0], location[1], point[0], point[1]
        )
        if dist < min_dist:
            min_dist = dist
            closest_idx = i
    return closest_idx


def _build_hazardous_polylines(interval_locations, interval_indices, polyline_coords):
    """
    Build list of polyline segments that pass through hazardous intervals.
    """
    hazardous_polylines = []
    for i in range(1, len(interval_locations)):
        if interval_locations[i]["hazardous"]:
            start_idx = interval_indices[i - 1]
            end_idx = interval_indices[i]
            hazardous_polylines.append(polyline_coords[start_idx : end_idx + 1])
    return hazardous_polylines


def get_route_and_intervals_no_api_key(
    origin_name, destination_name, interval_minutes=DEFAULT_INTERVAL
):
    """
    Get route from OSRM demo server and compute approximate locations at fixed time intervals.
    Returns (interval_locations, total_duration_seconds, total_distance_meters, polyline_coords, hazardous_polylines)
    On error returns (error_string, None, None, None, None).
    """
    if not (MIN_INTERVAL <= interval_minutes <= MAX_INTERVAL):
        return (
            f"Interval must be {MIN_INTERVAL}..{MAX_INTERVAL} minutes.",
            None,
            None,
            None,
            None,
        )

    origin_coords = geocode(origin_name)
    destination_coords = geocode(destination_name)
    if not origin_coords:
        return f"Failed to geocode origin: '{origin_name}'", None, None, None, None
    if not destination_coords:
        return (
            f"Failed to geocode destination: '{destination_name}'",
            None,
            None,
            None,
            None,
        )

    # OSRM expects lon,lat pairs
    coords_path = f"{origin_coords[1]},{origin_coords[0]};{destination_coords[1]},{destination_coords[0]}"
    url = f"{OSRM_URL}{coords_path}?overview=full&geometries=geojson&steps=false"

    headers = {"User-Agent": USER_AGENT}
    try:
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if not data or not data.get("routes"):
            if data and data.get("code") == "NoRoute":
                return (
                    "OSRM could not find a route between the points.",
                    None,
                    None,
                    None,
                    None,
                )
            return "OSRM returned no route data.", None, None, None, None

        route = data["routes"][0]
        total_duration_seconds = route.get("duration", 0.0)
        total_distance_meters = route.get("distance", 0.0)

        if not route.get("geometry") or not route["geometry"].get("coordinates"):
            return "OSRM route has no geometry.", None, None, None, None

        # Convert OSRM [lon, lat] to [lat, lon]
        polyline_coords = [[c[1], c[0]] for c in route["geometry"]["coordinates"]]
        if not polyline_coords:
            return "Empty polyline returned by OSRM.", None, None, None, None

        # Build cumulative distance along polyline
        cum_dist = [0.0]
        for i in range(1, len(polyline_coords)):
            lat1, lon1 = polyline_coords[i - 1]
            lat2, lon2 = polyline_coords[i]
            seg = haversine(lat1, lon1, lat2, lon2)
            cum_dist.append(cum_dist[-1] + seg)

        effective_total_distance = cum_dist[-1] if cum_dist else total_distance_meters

        if total_duration_seconds <= 0 or effective_total_distance <= 0:
            return "Route duration or distance is non-positive.", None, None, None, None

        average_speed_mps = effective_total_distance / total_duration_seconds
        interval_seconds = interval_minutes * 60

        interval_locations = []
        start_time = datetime.now()

        # origin
        origin_address = reverse_geocode(polyline_coords[0][0], polyline_coords[0][1])
        start_time_str = start_time.strftime("%A, %Y-%m-%d %H:%M:%S")
        weather = get_weather_forecast(
            polyline_coords[0][0], polyline_coords[0][1], start_time_str
        )
        if weather:
            weather["icon"] = get_weather_icon(weather["precipitation"])
        hazardous = is_hazardous(weather)
        interval_locations.append(
            {
                "absolute_time": start_time_str,
                "time_elapsed_minutes": 0,
                "location": polyline_coords[0],
                "description": f"Origin: {origin_address}",
                "weather": weather,
                "hazardous": hazardous,
            }
        )

        elapsed = 0.0
        while True:
            elapsed += interval_seconds
            if elapsed > total_duration_seconds:
                elapsed = total_duration_seconds

            interval_point = _create_interval_point(
                elapsed, average_speed_mps, polyline_coords, cum_dist, start_time
            )
            interval_locations.append(interval_point)

            if elapsed >= total_duration_seconds:
                break

        # ensure destination present (small epsilon check)
        last_loc = interval_locations[-1]["location"]
        if (
            abs(last_loc[0] - polyline_coords[-1][0]) > 1e-6
            or abs(last_loc[1] - polyline_coords[-1][1]) > 1e-6
        ):
            destination_address = reverse_geocode(
                polyline_coords[-1][0], polyline_coords[-1][1]
            )
            dest_time_str = (
                start_time + timedelta(seconds=int(total_duration_seconds))
            ).strftime("%A, %Y-%m-%d %H:%M:%S")
            weather = get_weather_forecast(
                polyline_coords[-1][0], polyline_coords[-1][1], dest_time_str
            )
            if weather:
                weather["icon"] = get_weather_icon(weather["precipitation"])
            hazardous = is_hazardous(weather)
            interval_locations.append(
                {
                    "absolute_time": dest_time_str,
                    "time_elapsed_minutes": int(total_duration_seconds / 60),
                    "location": polyline_coords[-1],
                    "description": f"Destination: {destination_address}",
                    "weather": weather,
                    "hazardous": hazardous,
                }
            )

        # Find hazardous segments
        interval_indices = [
            _find_closest_polyline_index(interval["location"], polyline_coords)
            for interval in interval_locations
        ]
        hazardous_polylines = _build_hazardous_polylines(
            interval_locations, interval_indices, polyline_coords
        )

        return (
            interval_locations,
            total_duration_seconds,
            total_distance_meters,
            polyline_coords,
            hazardous_polylines,
        )

    except requests.exceptions.Timeout:
        return "OSRM request timed out.", None, None, None, None
    except requests.exceptions.RequestException as e:
        print(f"ERROR: OSRM request failed: {e}")
        return "Network error when fetching route.", None, None, None, None
    except Exception as e:
        print(f"ERROR: Unexpected error: {e}")
        return "Unexpected error during route calculation.", None, None, None, None


def _calculate_map_center(polyline_coords):
    """
    Calculate the center point of the route or return default center.
    """
    if polyline_coords:
        lats = [p[0] for p in polyline_coords]
        lons = [p[1] for p in polyline_coords]
        return sum(lats) / len(lats), sum(lons) / len(lons)
    return DEFAULT_MAP_CENTER


def generate_map_html(
    origin,
    destination,
    polyline_coords,
    interval_locations,
    hazardous_polylines,
    output_filename="route_map.html",
):
    """
    Generate an HTML file with the route polyline and interval markers.
    Popups are positioned using iconAnchor/popupAnchor and CSS z-index is increased.
    """
    js_polyline_coords = json.dumps(polyline_coords)
    js_interval_locations = json.dumps(interval_locations)
    js_hazardous_polylines = json.dumps(hazardous_polylines)

    center_lat, center_lon = _calculate_map_center(polyline_coords)

    # Note: the multiline string below is an f-string; double braces {{ }} are used for literal braces in JS template strings.
    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Route: {origin} → {destination}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@{LEAFLET_VERSION}/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@{LEAFLET_VERSION}/dist/leaflet.js"></script>
  <style>
    body {{ margin: 0; padding: 0; font-family: sans-serif; }}
    h1 {{ text-align: center; margin: 10px 0; }}
    #mapid {{ height: 650px; width: 100%; border: 1px solid #ccc; border-radius: 6px; margin-bottom: 10px; }}
    #schedule {{ max-width: 1000px; margin: 10px auto; padding: 10px; font-size: 14px; }}
    #schedule table {{ width: 100%; border-collapse: collapse; }}
    #schedule th, #schedule td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
    #schedule th {{ background-color: #f2f2f2; }}
    .start-icon-div {{ background-color: green; border-radius: 50%; width: 22px; height: 22px; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; line-height: 1; cursor: pointer; }}
    .end-icon-div {{ background-color: red; border-radius: 50%; width: 22px; height: 22px; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; line-height: 1; cursor: pointer; }}
    .interval-icon-div {{ background-color: orange; border-radius: 50%; width: 16px; height: 16px; border: 1px solid white; display: inline-block; cursor: pointer; }}
    .hazardous-interval-icon-div {{ background-color: purple; border-radius: 50%; width: 16px; height: 16px; border: 1px solid white; display: inline-block; cursor: pointer; }}
    /* Ensure popups and markers are above other elements and clickable */
    .leaflet-popup {{ z-index: 99999 !important; pointer-events: auto; }}
    .leaflet-marker-icon {{ pointer-events: auto; z-index: 90000; }}
    .leaflet-container {{ -webkit-tap-highlight-color: transparent; }}
  </style>
</head>
<body>
  <h1>Car Route from {origin} to {destination}</h1>
  <div id="mapid"></div>
  <div id="schedule">
    <h2>Approximate Schedule</h2>
    <div id="schedule-container"></div>
  </div>

  <script>
    var map = L.map('mapid').setView([{center_lat}, {center_lon}], {DEFAULT_ZOOM});

    L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }}).addTo(map);

    var routeCoords = {js_polyline_coords};
    var poly = L.polyline(routeCoords, {{color: 'blue', weight: 4, opacity: 0.8}}).addTo(map);

    if (routeCoords.length > 0) {{
      map.fitBounds(poly.getBounds());
    }} else {{
      map.setView([{center_lat}, {center_lon}], {DEFAULT_ZOOM});
    }}

    var intervals = {js_interval_locations};
    var hazardous_polylines = {js_hazardous_polylines};

    hazardous_polylines.forEach(function(p) {{
        L.polyline(p, {{color: 'purple', weight: 6, opacity: 0.8}}).addTo(map);
    }});


    function buildScheduleTable(intervals) {{
      var container = document.getElementById('schedule-container');
      var table = document.createElement('table');
      table.innerHTML = '<tr><th>Elapsed (min)</th><th>Time</th><th>Approximate Location</th><th>Temp (°C)</th><th>Precip. (mm)</th></tr>';
      intervals.forEach(function(it) {{
        var row = document.createElement('tr');
        var temp = it.weather ? it.weather.temperature : 'N/A';
        var precip = it.weather ? it.weather.precipitation : 'N/A';
        var icon = it.weather ? it.weather.icon : '';
        row.innerHTML = '<td>' + it.time_elapsed_minutes + '</td>' +
                        '<td>' + it.absolute_time + '</td>' +
                        '<td>' + it.description + '</td>' +
                        '<td>' + icon + ' ' + temp + '</td>' +
                        '<td>' + precip + '</td>';
        table.appendChild(row);
      }});
      container.appendChild(table);
    }}

    var markers = [];
    intervals.forEach(function(it, idx) {{
      var isFirst = (idx === 0);
      var isLast = (idx === intervals.length - 1);
      var isHazardous = it.hazardous;

      var iconOptions;
      if (isFirst) {{
        // iconAnchor centers the icon; popupAnchor offsets the popup above the icon
        iconOptions = L.divIcon({{ className: 'start-icon-div', html: 'S', iconSize: [22,22], iconAnchor: [11,11], popupAnchor: [0, -14] }});
      }} else if (isLast) {{
        iconOptions = L.divIcon({{ className: 'end-icon-div', html: 'E', iconSize: [22,22], iconAnchor: [11,11], popupAnchor: [0, -14] }});
      }} else if (isHazardous) {{
          iconOptions = L.divIcon({{ className: 'hazardous-interval-icon-div', iconSize: [16,16], iconAnchor: [8,8], popupAnchor: [0, -10] }});
      }} else {{
        iconOptions = L.divIcon({{ className: 'interval-icon-div', iconSize: [16,16], iconAnchor: [8,8], popupAnchor: [0, -10] }});
      }}

      var lat = it.location[0], lon = it.location[1];
      var marker = L.marker([lat, lon], {{ icon: iconOptions, riseOnHover: true }}).addTo(map);

      var weatherInfo = '';
      if (it.weather) {{
        var icon = it.weather.icon || '';
        weatherInfo = '<br>Weather: ' + icon + ' ' + it.weather.temperature + '°C, ' + it.weather.precipitation + 'mm precip.';
        if (it.hazardous) {{
            weatherInfo += ' <b>(Hazardous Conditions)</b>';
        }}
      }}
      var popupHtml = '<b>' + it.description + '</b><br>Time: ' + it.absolute_time + '<br>Elapsed: ' + it.time_elapsed_minutes + ' min' + weatherInfo;
      marker.bindPopup(popupHtml);

      // tooltip for quick glance
      marker.bindTooltip(it.absolute_time + ' (' + it.time_elapsed_minutes + ' min)', {{ direction: 'top', offset: [0, -12] }});

      // explicit handlers to open popup and raise marker z-index
      marker.on('click', function(e) {{
        try {{
          this.openPopup();
          if (this.setZIndexOffset) this.setZIndexOffset(1000);
          if (this.bringToFront) this.bringToFront();
        }} catch (err) {{
          console && console.log && console.log('Marker click handler error', err);
        }}
      }});

      // optional: open popup briefly on mouseover for UX (comment out if too noisy)
      marker.on('mouseover', function(e) {{
        try {{
          this.openPopup();
        }} catch (err) {{}}
      }});
      marker.on('mouseout', function(e) {{
        try {{
          this.closePopup();
        }} catch (err) {{}}
      }});

      markers.push(marker);
    }});

    // open the first popup on load for visual confirmation
    if (markers.length > 0) {{
      try {{ markers[0].openPopup(); }} catch (err) {{}}
    }}

    buildScheduleTable(intervals);
  </script>
</body>
</html>
"""

    # Write file next to this script to avoid CWD issues
    script_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(script_dir, output_filename)
    try:
        os.makedirs(script_dir, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(html)
        print(f"INFO: Map HTML written to {path}")
        return path
    except Exception as e:
        print(f"ERROR: Failed to write map HTML: {e}")
        return None


def _get_user_input():
    """
    Get and validate user input for origin, destination, and interval.
    Returns (origin_point, destination_point, interval_minutes).
    """
    origin_point = input("Enter origin (e.g. 'Eiffel Tower, Paris'): ").strip()
    destination_point = input(
        "Enter destination (e.g. 'Louvre Museum, Paris'): "
    ).strip()
    try:
        interval_input = input(f"Interval in minutes (default {DEFAULT_INTERVAL}): ").strip()
        interval_minutes = int(interval_input) if interval_input else DEFAULT_INTERVAL
    except ValueError:
        print(f"Invalid interval, using {DEFAULT_INTERVAL} minutes.")
        interval_minutes = DEFAULT_INTERVAL

    return origin_point, destination_point, interval_minutes


if __name__ == "__main__":
    print("\n--- Car Route Calculator (OpenStreetMap / OSRM demo) ---")
    print("Note: This uses public demo services; respect their usage policies.\n")

    origin_point, destination_point, interval_minutes = _get_user_input()

    if not origin_point or not destination_point:
        print("Origin and destination cannot be empty.")
        raise SystemExit(1)

    (
        intervals,
        duration_s,
        distance_m,
        poly_coords,
        hazardous_polylines,
    ) = get_route_and_intervals_no_api_key(
        origin_point, destination_point, interval_minutes
    )
    if isinstance(intervals, str):
        print("Error:", intervals)
        raise SystemExit(1)

    print("\nRoute summary:")
    print(f"Origin: {origin_point}")
    print(f"Destination: {destination_point}")
    print(
        f"Distance: {distance_m / 1000:.2f} km, Duration: {duration_s / 60:.2f} minutes"
    )
    print("Intervals:")
    for it in intervals:
        loc = it["location"]
        weather_str = ""
        if it["weather"]:
            icon = it["weather"].get("icon", "")
            weather_str = f" (Weather: {icon} {it['weather']['temperature']}°C, {it['weather']['precipitation']}mm precip.)"
            if it["hazardous"]:
                weather_str += " (Hazardous)"
        print(
            f"  {it['absolute_time']} (+{it['time_elapsed_minutes']} min) -> {it['description']}{weather_str}"
        )

    if poly_coords:
        map_file = generate_map_html(
            origin_point,
            destination_point,
            poly_coords,
            intervals,
            hazardous_polylines,
        )
        if map_file:
            print(f"\nOpening map: {map_file}")
            try:
                webbrowser.open("file://" + os.path.abspath(map_file))
            except Exception as e:
                print(
                    f"Warning: could not open automatically ({e}). Open the file manually."
                )
        else:
            print("Failed to generate map HTML.")
