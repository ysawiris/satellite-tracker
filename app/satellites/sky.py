"""Sun position + satellite illumination math.

Uses the standard low-precision ephemeris formulas (USNO Astronomical
Almanac) — accurate to ~0.5°, more than enough for terminator drawing
and visible-pass filtering. Avoids pulling in a JPL ephemeris file.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

EARTH_RADIUS_KM = 6378.137
J2000 = datetime(2000, 1, 1, 12, tzinfo=UTC)


def _days_since_j2000(when: datetime) -> float:
    return (when - J2000).total_seconds() / 86400.0


def _sun_ecliptic(when: datetime) -> tuple[float, float, float]:
    """Return (ecliptic longitude, obliquity, days-since-J2000) in radians/days."""
    d = _days_since_j2000(when)
    mean_longitude = (280.460 + 0.9856474 * d) % 360
    mean_anomaly = math.radians((357.528 + 0.9856003 * d) % 360)
    ecliptic_lon = math.radians(
        mean_longitude
        + 1.915 * math.sin(mean_anomaly)
        + 0.020 * math.sin(2 * mean_anomaly)
    )
    obliquity = math.radians(23.439 - 0.0000004 * d)
    return ecliptic_lon, obliquity, d


def sun_subpoint(when: datetime | None = None) -> tuple[float, float]:
    """Sub-solar point (lat, lon) in degrees — the spot where the sun is overhead."""
    when = when or datetime.now(UTC)
    lam, eps, d = _sun_ecliptic(when)

    declination = math.asin(math.sin(eps) * math.sin(lam))
    right_ascension = math.atan2(math.cos(eps) * math.sin(lam), math.cos(lam))
    gmst = math.radians((280.46061837 + 360.98564736629 * d) % 360)
    sub_lon = math.degrees(right_ascension - gmst)
    sub_lon = ((sub_lon + 180) % 360) - 180
    return math.degrees(declination), sub_lon


def sun_eci_unit_vector(when: datetime | None = None) -> tuple[float, float, float]:
    """Unit vector pointing from Earth's center to the sun, in J2000 ECI."""
    when = when or datetime.now(UTC)
    lam, eps, _ = _sun_ecliptic(when)
    return (
        math.cos(lam),
        math.cos(eps) * math.sin(lam),
        math.sin(eps) * math.sin(lam),
    )


def is_satellite_sunlit(sat_eci_km: tuple[float, float, float], when: datetime) -> bool:
    """True when the satellite is in sunlight (not in Earth's umbra).

    Cylindrical shadow approximation: project the satellite onto the
    Earth-sun line. If it's on the day side (positive component), it's lit.
    On the night side, it's lit only if its perpendicular distance from
    that line exceeds Earth's radius.
    """
    sx, sy, sz = sun_eci_unit_vector(when)
    rx, ry, rz = sat_eci_km
    along_sun = rx * sx + ry * sy + rz * sz
    if along_sun > 0:
        return True
    perp_sq = rx * rx + ry * ry + rz * rz - along_sun * along_sun
    return perp_sq > EARTH_RADIUS_KM * EARTH_RADIUS_KM


def sun_altitude_at(observer_lat: float, observer_lon: float, when: datetime) -> float:
    """Sun altitude in degrees at the given observer + time. Negative = below horizon."""
    sub_lat, sub_lon = sun_subpoint(when)
    phi_o = math.radians(observer_lat)
    phi_s = math.radians(sub_lat)
    delta_lon = math.radians(observer_lon - sub_lon)
    cos_zenith = (
        math.sin(phi_o) * math.sin(phi_s)
        + math.cos(phi_o) * math.cos(phi_s) * math.cos(delta_lon)
    )
    cos_zenith = max(-1.0, min(1.0, cos_zenith))
    return 90.0 - math.degrees(math.acos(cos_zenith))
