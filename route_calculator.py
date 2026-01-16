import json
import math
import os
from datetime import datetime, timedelta

import requests

# --- Configuration for public services ---
# These services generally do not require an API key for light usage,
# but it's crucial to respect their individual usage policies and rate limits.
# For serious applications, consider hosting your own OSRM instance or using
# a commercial service built on OSM data that may require an API key.
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_URL = "http://router.project-osrm.org/route/v1/driving/"  # Public demo server
USER_AGENT = "LightMyWay-RouteCalculator/1.0 (https://github.com/yourusername/light-my-way)"  # Identify your application for service providers


def geocode(location_name):
    """
    Geocodes a location name to (latitude, longitude) coordinates using Nominatim.
    Returns (lat, lon) tuple or None if not found/error.
    """
    params = {
        "q": location_name,
        "format": "json",
        "limit": 1,
        "addressdetails": 0,  # We only need lat/lon
    }
    headers = {"User-Agent": USER_AGENT}
    try:
        response = requests.get(
            NOMINATIM_URL, params=params, headers=headers, timeout=5
        )
        response.raise_for_status()  # Raise an exception for HTTP errors (4xx or 5xx)
        data = response.json()
        if data and len(data) > 0:
            # Nominatim returns 'lat' and 'lon' as strings
            return float(data[0]["lat"]), float(data[0]["lon"])
        print(f"INFO: Could not geocode '{location_name}'. No results found.")
        return None
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Failed to geocode '{location_name}': {e}")
        return None


def haversine(lat1, lon1, lat2, lon2):
    """
    Calculates the great-circle distance between two points on the Earth
    (specified in decimal degrees) using the Haversine formula.
    Returns distance in meters.
    """
    R = 6371000  # Earth's mean radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def get_route_and_intervals_no_api_key(
    origin_name, destination_name, interval_minutes=30
):
    """
    Gets a car route between two points using OSRM and approximates locations at intervals.
    Does not require an API key, using public Nominatim and OSRM demo server.

    Args:
        origin_name (str): The starting point of the route (e.g., "Eiffel Tower, Paris").
        destination_name (str): The ending point of the route (e.g., "Louvre Museum, Paris").
        interval_minutes (int): The time interval in minutes for location approximations.

    Returns:
        tuple: (list of interval locations, total duration in seconds, total distance in meters, polyline_coords)
               or (error message string, None, None, None) if an error occurs.
    """
    if not (1 <= interval_minutes <= 1440):  # Max 24 hours
        return "Interval minutes must be between 1 and 1440.", None, None, None

    print(f"Attempting to geocode origin: '{origin_name}'...")
    origin_coords = geocode(origin_name)  # (lat, lon)
    print(f"Attempting to geocode destination: '{destination_name}'...")
    destination_coords = geocode(destination_name)  # (lat, lon)

    if not origin_coords:
        return f"Failed to geocode origin: '{origin_name}'.", None, None, None
    if not destination_coords:
        return f"Failed to geocode destination: '{destination_name}'.", None, None, None

    print(f"Origin coordinates: {origin_coords}")
    print(f"Destination coordinates: {destination_coords}")

    # OSRM expects longitude,latitude in the URL path for coordinates
    osrm_query_url = (
        f"{OSRM_URL}{origin_coords[1]},{origin_coords[0]};"
        f"{destination_coords[1]},{destination_coords[0]}?overview=full&geometries=geojson&steps=false"
    )

    headers = {"User-Agent": USER_AGENT}

    print(f"Fetching route from OSRM: {osrm_query_url}")
    try:
        response = requests.get(
            osrm_query_url, headers=headers, timeout=10
        )  # 10 second timeout for external API
        response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
        route_data = response.json()

        if not route_data or not route_data.get("routes"):
            # Check for OSRM specific errors like no route found
            if route_data and route_data.get("code") == "NoRoute":
                return (
                    "OSRM could not find a route between the specified points. Check if points are on a drivable road.",
                    None,
                    None,
                    None,
                )
            return "OSRM did not return any route data.", None, None, None

        route = route_data["routes"][0]
        total_duration_seconds = route["duration"]  # Duration in seconds
        total_distance_meters = route["distance"]  # Distance in meters

        # OSRM GeoJSON coordinates are [longitude, latitude]. Convert to [latitude, longitude].
        # Also, ensure we don't proceed with an empty geometry
        if not route["geometry"] or not route["geometry"]["coordinates"]:
            return "OSRM returned a route with no geometry.", None, None, None

        polyline_coords = [[p[1], p[0]] for p in route["geometry"]["coordinates"]]

        if not polyline_coords:
            return "OSRM route geometry is empty after decoding.", None, None, None

        # Calculate cumulative distances along the polyline using Haversine
        # This is more accurate than relying solely on OSRM's total distance
        # for interpolation purposes, as OSRM's total distance might encompass
        # details not perfectly reflected in the simplified `overview_polyline`.
        cumulative_distances = [0.0]
        for i in range(1, len(polyline_coords)):
            lat1, lon1 = polyline_coords[i - 1]
            lat2, lon2 = polyline_coords[i]
            segment_distance = haversine(lat1, lon1, lat2, lon2)
            cumulative_distances.append(cumulative_distances[-1] + segment_distance)

        # Adjust total_distance_meters to match the cumulative polyline distance
        # if there's a significant discrepancy, for more accurate interpolation
        effective_total_distance = cumulative_distances[-1]

        if total_duration_seconds <= 0:
            return (
                "Route duration is zero or negative, cannot calculate intervals.",
                None,
                None,
                None,
            )

        average_speed_mps = effective_total_distance / total_duration_seconds
        interval_seconds = interval_minutes * 60

        interval_locations = []
        start_time = datetime.now()

        # Add the origin location as the first point at current time
        interval_locations.append(
            {
                "absolute_time": start_time.strftime("%Y-%m-%d %H:%M:%S"),
                "time_elapsed_minutes": 0,
                "location": polyline_coords[0],
                "description": "Origin",
            }
        )

        current_elapsed_seconds = 0

        # Iterate through time intervals, ensuring we cover up to the total duration
        while True:
            current_elapsed_seconds += interval_seconds

            # If the next interval goes past the total duration, cap it at total_duration_seconds
            if current_elapsed_seconds > total_duration_seconds:
                current_elapsed_seconds = total_duration_seconds

            # Calculate the target distance along the polyline based on elapsed time and average speed
            target_distance_along_polyline = average_speed_mps * current_elapsed_seconds

            # Find the point on the polyline corresponding to target_distance_along_polyline
            location = None

            # Edge case: if the target distance is before the first segment, use the start point.
            if target_distance_along_polyline <= cumulative_distances[0]:
                location = polyline_coords[0]
            else:
                for i in range(1, len(cumulative_distances)):
                    if cumulative_distances[i] >= target_distance_along_polyline:
                        prev_dist = cumulative_distances[i - 1]
                        current_dist_along_polyline = cumulative_distances[i]
                        prev_point = polyline_coords[i - 1]
                        current_point = polyline_coords[i]

                        segment_length = current_dist_along_polyline - prev_dist

                        if (
                            segment_length <= 0
                        ):  # Avoid division by zero or negative length segments
                            location = prev_point
                        else:
                            fraction_along_segment = (
                                target_distance_along_polyline - prev_dist
                            ) / segment_length
                            interpolated_lat = prev_point[
                                0
                            ] + fraction_along_segment * (
                                current_point[0] - prev_point[0]
                            )
                            interpolated_lon = prev_point[
                                1
                            ] + fraction_along_segment * (
                                current_point[1] - prev_point[1]
                            )
                            location = (interpolated_lat, interpolated_lon)
                        break
                # If loop finishes and location is still None, it means target_distance_along_polyline > effective_total_distance.
                # This should only happen for the last point, which should be the destination.
                if location is None:
                    location = polyline_coords[
                        -1
                    ]  # Default to destination if somehow beyond calculated points

            if location:
                interval_locations.append(
                    {
                        "absolute_time": (
                            start_time + timedelta(seconds=current_elapsed_seconds)
                        ).strftime("%Y-%m-%d %H:%M:%S"),
                        "time_elapsed_minutes": int(current_elapsed_seconds / 60),
                        "location": location,
                        "description": f"Approximate location after {int(current_elapsed_seconds / 60)} minutes",
                    }
                )

            if (
                current_elapsed_seconds >= total_duration_seconds
            ):  # Break if we've reached or passed the total duration
                break

        # Ensure the destination is explicitly added as the very last point if it's not already there
        # Check if the last added point is effectively the destination
        if not interval_locations or (
            abs(interval_locations[-1]["location"][0] - polyline_coords[-1][0])
            > 0.000001
            or abs(interval_locations[-1]["location"][1] - polyline_coords[-1][1])
            > 0.000001
        ):  # Compare with a small epsilon
            interval_locations.append(
                {
                    "absolute_time": (
                        start_time + timedelta(seconds=total_duration_seconds)
                    ).strftime("%Y-%m-%d %H:%M:%S"),
                    "time_elapsed_minutes": int(total_duration_seconds / 60),
                    "location": polyline_coords[-1],
                    "description": "Destination",
                }
            )

        return (
            interval_locations,
            total_duration_seconds,
            total_distance_meters,
            polyline_coords,
        )

    except requests.exceptions.Timeout:
        print("ERROR: OSRM request timed out. The server might be busy or unreachable.")
        return "Failed to retrieve route: OSRM server timed out.", None, None, None
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Failed to fetch route from OSRM: {e}")
        print(
            "Please ensure you have an active internet connection and are not exceeding rate limits of public demo servers."
        )
        return (
            "Failed to retrieve route due to network or service error.",
            None,
            None,
            None,
        )
    except Exception as e:
        print(f"ERROR: An unexpected error occurred: {e}")
        import traceback

        traceback.print_exc()
        return (
            "An unexpected error occurred during route calculation.",
            None,
            None,
            None,
        )


def generate_map_html(
    origin,
    destination,
    polyline_coords,
    interval_locations,
    output_filename="route_map.html",
):
    """
    Generates an HTML file with a Leaflet map showing the route and interval locations.
    """
    # Convert Python list of lists to JSON string for JavaScript
    js_polyline_coords = json.dumps(polyline_coords)
    js_interval_locations = json.dumps(interval_locations)

    # Calculate the center of the map for initial view
    if polyline_coords:
        lats = [p[0] for p in polyline_coords]
        lons = [p[1] for p in polyline_coords]
        center_lat = sum(lats) / len(lats)
        center_lon = sum(lons) / len(lons)
    else:
        # Default to a generic location (e.g., center of Europe) if no polyline is available
        center_lat, center_lon = 48.8566, 2.3522  # Paris coordinates

    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <title>Car Route from {origin} to {destination}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
    <style>
        body {{ margin: 0; padding: 0; font-family: sans-serif; }}
        h1 {{ text-align: center; margin: 10px 0; }}
        #mapid {{ height: 800px; width: 100%; border: 1px solid #ccc; border-radius: 5px; margin-bottom: 20px; }};
        .start-icon-div {{ background-color: green; border-radius: 50%; width: 20px; height: 20px; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; line-height: 1; }}
        .end-icon-div {{ background-color: red; border-radius: 50%; width: 20px; height: 20px; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px; line-height: 1; }}
        .interval-icon-div {{ background-color: orange; border-radius: 50%; width: 15px; height: 15px; border: 1px solid white; }}
    </style>
</head>
<body>
    <h1>Car Route from {origin} to {destination}</h1>
    <div id="mapid"></div>

    <script>
        var map = L.map('mapid').setView([{center_lat}, {center_lon}], 10);

        L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }}).addTo(map);

        var routeCoords = {js_polyline_coords};
        var routePolyline = L.polyline(routeCoords, {{color: 'blue', weight: 4, opacity: 0.7}}).addTo(map);

        // Fit map bounds to the route polyline
        if (routeCoords.length > 0) {{
            map.fitBounds(routePolyline.getBounds());
        }} else {{
            map.setView([{center_lat}, {center_lon}], 10);
        }}

        var intervalLocations = {js_interval_locations};
        intervalLocations.forEach(function(interval, index) {{
            // Skip the very first (origin) and very last (destination) if they are handled separately
            if (index === 0 || index === intervalLocations.length - 1) return;

            var intervalIcon = L.divIcon({{
                className: 'interval-icon-div',
                iconSize: [15, 15]
            }});
            var marker = L.marker([interval.location[0], interval.location[1]], {{icon: intervalIcon}}).addTo(map);
            marker.bindPopup(`<b>${{interval.description}}</b><br>Time: ${{interval.absolute_time}}`);
        }});

        // Add start and end markers with distinct colors
        if (routeCoords.length > 0) {{
            var startIcon = L.divIcon({{
                className: 'start-icon-div',
                html: 'S',
                iconSize: [24, 24]
            }});
            L.marker(routeCoords[0], {{icon: startIcon}}).addTo(map).bindPopup('<b>Origin: {origin}</b><br>Start Time: ' + intervalLocations[0].absolute_time);

            var endIcon = L.divIcon({{
                className: 'end-icon-div',
                html: 'E',
                iconSize: [24, 24]
            }});
            // Ensure the last interval location is used for destination time if available
            var arrivalTime = intervalLocations.length > 1 ? intervalLocations[intervalLocations.length - 1].absolute_time : 'N/A';
            L.marker(routeCoords[routeCoords.length - 1], {{icon: endIcon}}).addTo(map).bindPopup('<b>Destination: {destination}</b><br>Arrival Time: ' + arrivalTime);
        }}
    </script>
</body>
</html>
    """

    # Write the map HTML file next to this script and ensure the directory exists.
    # This avoids assuming a specific project-relative path that may not exist.
    script_dir = os.path.dirname(os.path.abspath(__file__))
    map_file_path = os.path.join(script_dir, output_filename)
    try:
        # Ensure the directory is present (no-op if it already exists).
        os.makedirs(script_dir, exist_ok=True)
        # Write using utf-8 encoding for broader character support.
        with open(map_file_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"INFO: Map HTML generated successfully at {map_file_path}")
        return map_file_path
    except FileNotFoundError as e:
        print(f"ERROR: Directory for map file not found: {e}")
        return None
    except PermissionError as e:
        print(f"ERROR: Permission denied when writing map file: {e}")
        return None
    except OSError as e:
        print(f"ERROR: Could not write map HTML file due to OS error: {e}")
        return None
    except Exception as e:
        print(f"ERROR: Unexpected error when writing map HTML file: {e}")
        return None


if __name__ == "__main__":
    print("\n--- Car Route Calculator (OpenStreetMap based, no API Key) ---")
    print(
        "Note: This uses public demo servers for Nominatim (geocoding) and OSRM (routing)."
    )
    print(
        "Please respect their usage policies. It is not suitable for production use due to"
    )
    print("potential rate limits and unreliability of public demo servers.\n")

    origin_point = input("Enter origin point (e.g., 'Eiffel Tower, Paris'): ")
    destination_point = input(
        "Enter destination point (e.g., 'Louvre Museum, Paris'): "
    )

    try:
        interval_input = input("Enter interval in minutes (default 30): ")
        interval_minutes = int(interval_input) if interval_input else 30
    except ValueError:
        print("Invalid interval. Using default of 30 minutes.")
        interval_minutes = 30

    if origin_point and destination_point:
        # Modified to also return polyline_coords
        intervals, duration, distance, polyline_coords = (
            get_route_and_intervals_no_api_key(
                origin_point, destination_point, interval_minutes
            )
        )

        if isinstance(intervals, str):  # Check if it's an error message
            print(f"\nError: {intervals}")
        elif intervals is None:
            print("\nFailed to get route data for an unknown reason.")
        else:
            print("\n--- Route and Interval Details ---")
            print(f"Origin: {origin_point}")
            print(f"Destination: {destination_point}")
            print(f"Total Distance: {distance / 1000:.2f} km")
            print(f"Total Duration: {duration / 60:.2f} minutes")
            print(f"Approximated Locations at {interval_minutes}-minute Intervals:")
            for interval in intervals:
                # Format location coordinates to 6 decimal places for readability
                formatted_location = (
                    f"{interval['location'][0]:.6f}",
                    f"{interval['location'][1]:.6f}",
                )
                print(
                    f"  Time: {interval['absolute_time']} ({interval['time_elapsed_minutes']} min elapsed), Location (Lat, Lng): {formatted_location}, Description: {interval['description']}"
                )

            # Generate and open the map
            if polyline_coords:
                map_file = generate_map_html(
                    origin_point, destination_point, polyline_coords, intervals
                )
                if map_file:
                    print(f"\nOpening map in browser: {map_file}")
                    # In a real environment, you'd use a web browser library or instruct the user
                    # For this environment, we'll use the provided open tool if available
                    # import webbrowser
                    # webbrowser.open(map_file)
                    # Assuming default_api.open is available for opening local files in the sandbox
                    # If running outside the sandbox, use webbrowser.open
                    try:
                        default_api.open(path_or_url=map_file)
                    except NameError:  # Fallback if default_api is not defined (e.g., running directly without sandbox tools)
                        print(
                            "Warning: `default_api.open` not available. Please open the HTML file manually in your browser."
                        )
                else:
                    print("Failed to generate map HTML.")
            else:
                print("Cannot generate map: No polyline coordinates available.")
    else:
        print("Origin and destination cannot be empty.")
