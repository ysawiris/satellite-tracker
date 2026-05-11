"""Orbital computation using Skyfield.

Provides current sub-satellite point, velocity, pass prediction (with
visibility filter), orbit ground tracks, and a sub-solar point used to
draw the day/night terminator. Built against Skyfield 1.49+
(`wgs84.subpoint`, `EarthSatellite.find_events`).
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from skyfield.api import EarthSatellite, load, wgs84

from .celestrak import TLE
from .sky import is_satellite_sunlit, sun_altitude_at, sun_subpoint

_ts = load.timescale()

# A satellite is potentially "spottable" when the sun is at least this far
# below the horizon at the observer (civil twilight).
DARK_SUN_ALTITUDE_DEG = -6.0


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

    pos_km = geocentric.position.km
    sunlit = is_satellite_sunlit(
        (float(pos_km[0]), float(pos_km[1]), float(pos_km[2])),
        t.utc_datetime(),
    )

    return {
        "name": sat.name,
        "norad_id": int(sat.model.satnum),
        "lat": float(subpoint.latitude.degrees),
        "lon": float(subpoint.longitude.degrees),
        "alt_km": float(subpoint.elevation.km),
        "velocity_kms": round(speed, 3),
        "epoch": sat.epoch.utc_iso(),
        "sunlit": sunlit,
    }


def orbit_track(
    sat: EarthSatellite,
    minutes: int = 120,
    step_seconds: int = 30,
) -> list[dict]:
    """Sample the satellite's ground track for the next `minutes` minutes.

    Returns one sample per `step_seconds` with sub-satellite lat/lon/alt
    and a sunlit flag — enough to draw a glowing orbit polyline.
    """
    minutes = max(1, min(int(minutes), 720))  # cap at 12h
    step_seconds = max(5, min(int(step_seconds), 300))

    now = datetime.now(UTC)
    samples: list[dict] = []
    for offset in range(0, minutes * 60 + 1, step_seconds):
        when = now + timedelta(seconds=offset)
        t = _ts.from_datetime(when)
        geocentric = sat.at(t)
        subpoint = wgs84.subpoint(geocentric)
        pos_km = geocentric.position.km
        samples.append({
            "t": when.isoformat().replace("+00:00", "Z"),
            "lat": float(subpoint.latitude.degrees),
            "lon": float(subpoint.longitude.degrees),
            "alt_km": float(subpoint.elevation.km),
            "sunlit": is_satellite_sunlit(
                (float(pos_km[0]), float(pos_km[1]), float(pos_km[2])),
                when,
            ),
        })
    return samples


def predict_passes(
    sat: EarthSatellite,
    lat: float,
    lon: float,
    days: int = 5,
    min_altitude_deg: float = 10.0,
    visible_only: bool = False,
) -> list[dict]:
    """Predict passes over an observer location, tagged with visibility.

    A pass is "visible" when, at culmination, the satellite is sunlit
    AND the sun is below the civil-twilight threshold at the observer —
    i.e. the kind you can actually go outside and see. Passes that are
    still in progress when the window opens are skipped to keep the
    table clean.
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

            culm_dt = t.utc_datetime()
            sat_pos_km = sat.at(t).position.km
            sat_sunlit = is_satellite_sunlit(
                (float(sat_pos_km[0]), float(sat_pos_km[1]), float(sat_pos_km[2])),
                culm_dt,
            )
            sun_alt = sun_altitude_at(lat, lon, culm_dt)
            observer_dark = sun_alt <= DARK_SUN_ALTITUDE_DEG
            current["sat_sunlit"] = sat_sunlit
            current["observer_sun_altitude_deg"] = round(sun_alt, 1)
            current["visible"] = sat_sunlit and observer_dark
        elif event == 2 and current is not None and "rise_utc" in current:
            current["set_utc"] = t.utc_iso()
            if "culminate_utc" in current:
                rise_dt = datetime.fromisoformat(current["rise_utc"].replace("Z", "+00:00"))
                set_dt = datetime.fromisoformat(current["set_utc"].replace("Z", "+00:00"))
                current["duration_seconds"] = int((set_dt - rise_dt).total_seconds())
                if not visible_only or current.get("visible"):
                    passes.append(current)
            current = None

    return passes


def sky_track(
    sat: EarthSatellite,
    lat: float,
    lon: float,
    start: datetime,
    end: datetime,
    step_seconds: int = 10,
) -> list[dict]:
    """Sample alt/az for an observer-relative pass — used to draw pass arcs on the sky radar."""
    if end <= start:
        return []
    step_seconds = max(1, min(int(step_seconds), 120))
    # Hard cap on samples to keep the response small even if a caller asks for hours at 1s resolution.
    max_samples = 600
    span = (end - start).total_seconds()
    if span / step_seconds > max_samples:
        step_seconds = max(step_seconds, int(span / max_samples) + 1)

    observer = wgs84.latlon(lat, lon)
    diff = sat - observer

    samples: list[dict] = []
    cur = start
    while cur <= end:
        t = _ts.from_datetime(cur)
        alt, az, distance = diff.at(t).altaz()
        samples.append({
            "t": cur.isoformat().replace("+00:00", "Z"),
            "alt": round(float(alt.degrees), 2),
            "az": round(float(az.degrees), 2),
            "range_km": round(float(distance.km), 1),
        })
        cur += timedelta(seconds=step_seconds)
    return samples


def sun_position_now() -> dict:
    """Current sub-solar point — used by the frontend to draw the terminator."""
    now = datetime.now(UTC)
    sub_lat, sub_lon = sun_subpoint(now)
    return {
        "lat": sub_lat,
        "lon": sub_lon,
        "t": now.isoformat().replace("+00:00", "Z"),
    }
