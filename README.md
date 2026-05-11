# Satellite Tracker

Live web app that tracks every visible satellite over Earth — 2D map, 3D globe, observer-centered sky radar, and onboard "ride along" camera. Pure static frontend; orbital math runs entirely in the browser.

**Live demo:** https://ysawiris.github.io/satellite-tracker/

## Features

- **2D map** (Leaflet + dark CartoDB tiles) with day/night terminator and sub-solar marker
- **3D globe** (CesiumJS) with real-time lighting and a NASA MODIS Aqua + Terra cloud-cover composite, plus a play/scrub timeline of the past week's clouds
- **Sky view** — observer-centered polar radar showing what's overhead right now; click any "✦ Visible" pass and the predicted arc traces across the dial
- **Onboard view** — locks the camera to any satellite and follows it across orbit
- **Pass predictions** with a "naked-eye only" filter (sat sunlit + observer in twilight or darker)
- **Imagery integration** — for each satellite, surfaces where to view (free) or buy (paid) imagery: Landsat → USGS, Sentinel → Copernicus Browser, MODIS → Worldview, WorldView → Maxar, Pléiades → Airbus, etc.
- **Search**, **favorites** (localStorage), **PWA** with offline shell

## Architecture

Pure static — deployed to GitHub Pages, no server-side execution.

```
index.html                 ← single-page app entry
static/
├── css/app.css            ← design system (Aurora Glass)
├── js/
│   ├── app.js             ← entry point + UI wiring
│   ├── api.js             ← facade — calls local compute, no HTTP
│   ├── sat-core.js        ← satellite.js wrapper: positions, alt/az, orbits
│   ├── sun-math.js        ← sub-solar point + satellite illumination
│   ├── passes.js          ← rise / culmination / set + visibility
│   ├── tle-store.js       ← fetches data/groups/<id>.txt, builds satrecs
│   ├── sat-data.js        ← group definitions + sensor & imagery metadata
│   ├── map.js             ← Leaflet view
│   ├── globe.js           ← CesiumJS view (lazy-loaded)
│   ├── skyview.js         ← SVG polar radar
│   └── sw.js              ← service worker (offline shell)
└── manifest.webmanifest
data/groups/<id>.txt       ← raw CelesTrak TLE files, refreshed every 4h
                             by .github/workflows/refresh-tles.yml
.github/workflows/
├── refresh-tles.yml       ← cron: fetch CelesTrak → commit data/groups/
├── deploy-pages.yml       ← deploy to GitHub Pages on every push
└── ci.yml                 ← legacy: Python tests for the reference impl
```

The Flask backend in `app/` is the original reference implementation and the source of truth for the orbital math (mirrored test-for-test in JS). It's not used by the live deploy.

## How it stays current with no backend

```
┌────────────────────────────────────┐       ┌─────────────────────────────────┐
│  GitHub Action (cron, every 4h)    │──────▶│  data/groups/*.txt commits      │
│  fetches CelesTrak TLEs            │       │  pushed to main                 │
└────────────────────────────────────┘       └─────────────────────────────────┘
                                                          │
                                                          ▼
┌────────────────────────────────────┐       ┌─────────────────────────────────┐
│  Browser loads static site from    │◀──────│  GitHub Pages deploys main      │
│  GitHub Pages                      │       │  on every push (~30 s)          │
└────────────────────────────────────┘       └─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────┐
│  satellite.js (SGP4) propagates    │
│  positions in-browser, every 30 s  │
└────────────────────────────────────┘
```

No CORS issues (data lives at the same origin), no rate limits, no cold starts, $0 hosting.

## Local development

```bash
# Pure static — open the page, that's it.
python3 -m http.server 5051   # any static server
open http://127.0.0.1:5051
```

For the legacy Flask reference implementation:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
flask --app app.main run --debug
pytest        # runs the Skyfield-based unit tests
```

## Tech stack

- **satellite.js** v5 — SGP4 orbital propagation
- **Leaflet** + CartoDB dark tiles — 2D map
- **CesiumJS** + ESRI World Imagery + NASA GIBS — 3D globe + clouds
- **NASA GIBS MODIS Aqua + Terra** — composite cloud cover with time-scrub
- **Tailwind CSS** + custom design system — UI
- **Inter** + **Space Grotesk** — typography
- **GitHub Pages** + **GitHub Actions** — hosting + data refresh + CI

Original Python reference uses **Flask**, **Skyfield**, **NumPy**, **Requests**.

## Data sources

- **CelesTrak** — TLEs (2-line orbital elements), free, no key
- **NASA GIBS** — global cloud imagery (MODIS, VIIRS), free, no key
- **OpenStreetMap / CartoDB / ESRI** — basemaps

## License

MIT
