# Light My Way - Car Route Calculator

A Python application that calculates car routes using OpenStreetMap and OSRM, with real-time weather forecasting and interactive maps.

## Features

- **Route Calculation**: Uses OSRM (Open Source Routing Machine) to calculate optimal car routes
- **Geocoding**: Converts location names to coordinates using Nominatim
- **Weather Forecasting**: Fetches weather data from Open-Meteo API
- **Hazard Detection**: Identifies hazardous driving conditions (cold + rainy)
- **Interactive Maps**: Generates interactive Leaflet maps with route visualization
- **Schedule Generation**: Creates a detailed itinerary with time intervals and weather information

## Installation

### Prerequisites
- Python 3.8+
- pip

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/light-my-way.git
cd light-my-way
```

2. Install dependencies:
```bash
pip install requests
```

## Usage

Run the script:
```bash
python3 route_calculator.py
```

Follow the prompts:
- Enter origin location (e.g., "Eiffel Tower, Paris")
- Enter destination location (e.g., "Louvre Museum, Paris")
- Enter interval in minutes (default: 30)

The script will:
1. Calculate the route
2. Generate an interactive HTML map (`route_map.html`)
3. Automatically open it in your default browser
4. Display a detailed schedule with weather forecasts

## How It Works

### Route Calculation
- Geocodes origin/destination using Nominatim (OpenStreetMap)
- Requests route from OSRM demo server
- Interpolates locations at regular time intervals
- Builds cumulative distance along the route

### Weather Integration
- Fetches hourly weather forecasts from Open-Meteo
- Shows temperature and precipitation at each interval
- Flags hazardous conditions (≤25°C AND precipitation > 0mm)
- Highlights risky route segments on the map

### Map Generation
- Creates interactive Leaflet-based HTML map
- Shows route polyline and interval markers
- Displays hazardous segments in purple
- Includes popups with weather and timing information
- Responsive table with full schedule

## API Services Used

- **Nominatim** (nominatim.openstreetmap.org) - Geocoding
- **OSRM** (router.project-osrm.org) - Route calculation
- **Open-Meteo** (api.open-meteo.com) - Weather forecasting

All services are public and free to use. Please respect their usage policies.

## Output

The script generates:
- **route_map.html** - Interactive map visualization
- Console output with route summary and schedule

## Configuration

Key parameters are defined as constants at the top of `route_calculator.py`:
- `HAZARD_TEMP_THRESHOLD` - Temperature threshold for hazards (default: 25°C)
- `DEFAULT_INTERVAL` - Default time interval (default: 30 minutes)
- `DEFAULT_ZOOM` - Map zoom level (default: 10)
- `REQUEST_TIMEOUT` - API request timeout (default: 12 seconds)

## Example

```
--- Car Route Calculator (OpenStreetMap / OSRM demo) ---
Note: This uses public demo services; respect their usage policies.

Enter origin (e.g. 'Eiffel Tower, Paris'): Times Square, New York
Enter destination (e.g. 'Louvre Museum, Paris'): Central Park, New York
Interval in minutes (default 30): 15

Route summary:
Origin: Times Square, New York
Destination: Central Park, New York
Distance: 2.15 km, Duration: 8.25 minutes
Intervals:
  Sunday, 2026-03-22 14:30:45 (+0 min) -> Origin: Times Square (Weather: ☀️ 18°C, 0mm precip.)
  Sunday, 2026-03-22 14:46:00 (+15 min) -> Approximate location after 15 minutes: Madison Avenue (Weather: ☀️ 18°C, 0mm precip.)
  ...
```

## License

This project is provided as-is for educational and personal use.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.
