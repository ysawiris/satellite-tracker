"""Orbital computation using Skyfield.

Provides current sub-satellite point, velocity, and pass prediction for an
observer's lat/lon. Built against Skyfield 1.49+ (`wgs84.subpoint`,
`EarthSatellite.find_events`).
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from skyfield.api import EarthSatellite, load, wgs84

from .celestrak import TLE

_ts = load.timescale()


@lru_cache(maxsize=4096)
def _build_satellite(name: str, l1: str, l2: str) -> EarthSatellite:
    return EarthSatellite(l1, l2, name, _ts)


def build_satellite(tle: TLE) -> EarthSatellite:
    return _build_satellite(*tle)


def position_now(sat: EarthSatellite) -> dict:
    """Return current sub-satellite point and orbital parameters."""
    t = _ts.now()
    geocentric = sat.at(t)
    subpoint = wgs84.subpoint(geocentric)

    velocity = geocentric.velocity.km_per_s
    speed = math.sqrt(float(velocity[0]) ** 2 + float(velocity[1]) ** 2 + float(velocity[2]) ** 2)

    return {
        "name": sat.name,
        "norad_id": int(sat.model.satnum),
        "lat": float(subpoint.latitude.degrees),
        "lon": float(subpoint.longitude.degrees),
        "alt_km": float(subpoint.elevation.km),
        "velocity_kms": round(speed, 3),
        "epoch": sat.epoch.utc_iso(),
    }


def predict_passes(
    sat: EarthSatellite,
    lat: float,
    lon: float,
    days: int = 5,
    min_altitude_deg: float = 10.0,
) -> list[dict]:
    """Predict visible passes over an observer location.

    Returns rise/culmination/set events bundled into pass dicts. Passes that
    are still in progress (no rise event before the window starts) are
    skipped to keep the table clean.
    """
    observer = wgs84.latlon(lat, lon)
    t0 = _ts.now()
    t1 = _ts.from_datetime(datetime.now(UTC) + timedelta(days=days))

    times, events = sat.find_events(observer, t0, t1, altitude_degrees=min_altitude_deg)

    diff = sat - observer
    passes: list[dict] = []
    current: dict | None = None

    for t, event in zip(times, events, strict=False):
        # 0 = rise, 1 = culminate, 2 = set
        if event == 0:
            current = {"rise_utc": t.utc_iso()}
        elif event == 1 and current is not None:
            alt, az, _ = diff.at(t).altaz()
            current["culminate_utc"] = t.utc_iso()
            current["max_altitude_deg"] = round(float(alt.degrees), 1)
            current["azimuth_deg"] = round(float(az.degrees), 1)
        elif event == 2 and current is not None and "rise_utc" in current:
            current["set_utc"] = t.utc_iso()
            if "culminate_utc" in current:
                rise_dt = datetime.fromisoformat(current["rise_utc"].replace("Z", "+00:00"))
                set_dt = datetime.fromisoformat(current["set_utc"].replace("Z", "+00:00"))
                current["duration_seconds"] = int((set_dt - rise_dt).total_seconds())
                passes.append(current)
            current = None

    return passes


