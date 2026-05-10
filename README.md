# Satellite Tracker

Real-time satellite tracking on a 2D map and 3D globe, powered by [CelesTrak](https://celestrak.org/) TLE data and [Skyfield](https://rhodesmill.org/skyfield/).

## Features

- Live satellite positions for ISS, Hubble, Starlink, GPS, weather satellites, and more
- 2D map (Leaflet + OpenStreetMap) and 3D globe (CesiumJS) views
- Pass predictions for any satellite at your location
- Search by name or NORAD ID
- Saved favorites (persisted in localStorage)
- Dark mode
- Installable as a PWA
- REST API for programmatic access
- No API keys or accounts required — CelesTrak is free and open

## Quick start

### Local development

```bash
# Python 3.11+
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

cp .env.example .env  # tweak if you like
flask --app app.main run --debug
```

Open http://127.0.0.1:5000.

### Docker

```bash
docker build -t satellite-tracker .
docker run -p 5000:5000 satellite-tracker
```

## REST API

All endpoints return `{ "data": ..., "error": null }` or `{ "data": null, "error": "message" }`.

| Endpoint                                          | Description                                     |
| ------------------------------------------------- | ----------------------------------------------- |
| `GET /api/groups`                                 | List satellite groups                           |
| `GET /api/groups/<group_id>/satellites`           | Current positions for all satellites in a group |
| `GET /api/satellites/<norad_id>`                  | Current position of a specific satellite        |
| `GET /api/satellites/<norad_id>/passes?lat&lon`   | Upcoming passes over an observer location       |
| `GET /api/positions?norad_ids=25544,20580`        | Current positions for a list of NORAD IDs       |
| `GET /api/search?q=iss`                           | Search by name or NORAD ID                      |
| `GET /health`                                     | Liveness check                                  |

Example:

```bash
curl 'http://127.0.0.1:5000/api/satellites/25544/passes?lat=37.7749&lon=-122.4194&days=3'
```

## Testing

```bash
pytest          # all tests
ruff check .    # lint
```

CI runs both on every push (see `.github/workflows/ci.yml`).

## Configuration

All config is loaded from environment variables (or `.env`). See `.env.example` for the full list:

| Variable                  | Default      | Notes                                                  |
| ------------------------- | ------------ | ------------------------------------------------------ |
| `TLE_CACHE_TTL_MINUTES`   | `120`        | CelesTrak asks clients to cache for at least 2 hours   |
| `FLASK_SECRET_KEY`        | `change-me`  | Generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `HOST`                    | `127.0.0.1`  |                                                        |
| `PORT`                    | `5000`       |                                                        |

## Architecture

```
app/
├── main.py              # Flask app factory
├── config.py            # Env-driven config
├── api.py               # REST endpoints
└── satellites/
    ├── groups.py        # Group definitions (ISS, Starlink, ...)
    ├── celestrak.py     # CelesTrak GP TLE client
    ├── tle_cache.py     # In-memory TTL cache
    └── compute.py       # Skyfield position + pass prediction

static/
├── js/
│   ├── app.js           # Entry point
│   ├── api.js           # REST wrapper
│   ├── state.js         # Tiny pub/sub store
│   ├── map.js           # Leaflet 2D map
│   ├── globe.js         # CesiumJS 3D globe (lazy-loaded)
│   ├── favorites.js     # localStorage favorites
│   └── sw.js            # Service worker
└── manifest.webmanifest # PWA manifest

templates/
├── base.html            # Layout + Tailwind + dark-mode bootstrap
└── index.html           # Single page application
```

## License

MIT
