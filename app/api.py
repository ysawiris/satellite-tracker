"""REST API endpoints.

All endpoints return JSON. The shape is `{ "data": ..., "error": null }`
or `{ "data": null, "error": "message" }`. Group lookups and per-satellite
queries delegate to the TLE cache so we don't hammer CelesTrak.
"""

from __future__ import annotations

import logging

from flask import Blueprint, current_app, jsonify, request
from skyfield.api import EarthSatellite

from .satellites.celestrak import CelestrakError, fetch_tles
from .satellites.compute import (
    build_satellite,
    orbit_track,
    position_now,
    predict_passes,
    sky_track,
    sun_position_now,
)
from .satellites.groups import GROUPS, get_group, serialize_group
from .satellites.metadata import get_imagery_info, get_sensor_info, serialize_imagery
from .satellites.tle_cache import TLECache

logger = logging.getLogger(__name__)

bp = Blueprint("api", __name__, url_prefix="/api")


def _cache() -> TLECache:
    return current_app.extensions["tle_cache"]


def _ok(data, status: int = 200):
    return jsonify({"data": data, "error": None}), status


def _err(message: str, status: int = 400):
    return jsonify({"data": None, "error": message}), status


def _load_group_tles(group_id: str):
    group = get_group(group_id)
    if not group:
        return None, _err(f"Unknown group: {group_id}", 404)
    try:
        tles = _cache().get(group.id, lambda: fetch_tles(group.query))
    except CelestrakError as exc:
        logger.exception("CelesTrak error for %s", group_id)
        return None, _err(str(exc), 502)
    return (group, tles), None


@bp.get("/groups")
def list_groups():
    return _ok([serialize_group(g) for g in GROUPS])


@bp.get("/groups/<group_id>/satellites")
def group_satellites(group_id: str):
    result, error = _load_group_tles(group_id)
    if error:
        return error
    group, tles = result
    out = []
    for tle in tles:
        try:
            sat = build_satellite(tle)
            pos = position_now(sat)
            pos["group"] = group.id
            pos["color"] = group.color
            info = get_sensor_info(pos["norad_id"], group.id)
            pos["sensor_type"] = info.sensor_type
            pos["all_weather"] = info.all_weather
            pos["sensor_description"] = info.description
            pos["imagery"] = serialize_imagery(get_imagery_info(pos["norad_id"], pos["name"]))
            out.append(pos)
        except Exception:
            logger.exception("Failed to compute position for %s", tle[0])
    return _ok(out)


@bp.get("/satellites/<int:norad_id>")
def satellite_detail(norad_id: int):
    sat = _find_satellite_by_norad(norad_id)
    if not sat:
        return _err(f"Satellite {norad_id} not found", 404)
    pos = position_now(sat)
    info = get_sensor_info(pos["norad_id"])
    pos["sensor_type"] = info.sensor_type
    pos["all_weather"] = info.all_weather
    pos["sensor_description"] = info.description
    pos["imagery"] = serialize_imagery(get_imagery_info(pos["norad_id"], pos["name"]))
    return _ok(pos)


@bp.get("/satellites/<int:norad_id>/passes")
def satellite_passes(norad_id: int):
    try:
        lat = float(request.args["lat"])
        lon = float(request.args["lon"])
    except (KeyError, ValueError):
        return _err("Required query params: lat, lon (floats)")

    days = max(1, min(int(request.args.get("days", 5)), 14))
    min_alt = float(request.args.get("min_alt", 10.0))
    visible_only = request.args.get("visible_only", "").lower() in ("1", "true", "yes")

    sat = _find_satellite_by_norad(norad_id)
    if not sat:
        return _err(f"Satellite {norad_id} not found", 404)

    passes = predict_passes(
        sat, lat, lon, days=days, min_altitude_deg=min_alt, visible_only=visible_only,
    )
    return _ok({"satellite": sat.name, "norad_id": int(sat.model.satnum), "passes": passes})


@bp.get("/satellites/<int:norad_id>/orbit")
def satellite_orbit(norad_id: int):
    """Ground-track samples for the next N minutes — used to draw orbit trails."""
    minutes = max(1, min(int(request.args.get("minutes", 120)), 720))
    step = max(5, min(int(request.args.get("step_seconds", 30)), 300))

    sat = _find_satellite_by_norad(norad_id)
    if not sat:
        return _err(f"Satellite {norad_id} not found", 404)

    samples = orbit_track(sat, minutes=minutes, step_seconds=step)
    return _ok({
        "satellite": sat.name,
        "norad_id": int(sat.model.satnum),
        "samples": samples,
    })


@bp.get("/sun")
def sun_position():
    """Current sub-solar point — frontend uses this to draw the terminator."""
    return _ok(sun_position_now())


@bp.get("/satellites/<int:norad_id>/skytrack")
def satellite_skytrack(norad_id: int):
    """Alt/az samples over a time window — used to draw pass arcs on the sky radar.

    Required: lat, lon, start (ISO8601), end (ISO8601). Optional: step_seconds (default 10).
    """
    from datetime import datetime as _dt

    try:
        lat = float(request.args["lat"])
        lon = float(request.args["lon"])
        start = _dt.fromisoformat(request.args["start"].replace("Z", "+00:00"))
        end = _dt.fromisoformat(request.args["end"].replace("Z", "+00:00"))
    except (KeyError, ValueError) as exc:
        return _err(f"Required: lat, lon, start, end (ISO). {exc}")

    step = int(request.args.get("step_seconds", 10))

    sat = _find_satellite_by_norad(norad_id)
    if not sat:
        return _err(f"Satellite {norad_id} not found", 404)

    samples = sky_track(sat, lat, lon, start, end, step_seconds=step)
    return _ok({
        "norad_id": int(sat.model.satnum),
        "satellite": sat.name,
        "samples": samples,
    })


@bp.get("/positions")
def live_positions():
    """Get current positions for a comma-separated list of NORAD IDs.

    Used by the frontend's live-update polling — small payload, no group fetch.
    """
    ids_param = request.args.get("norad_ids", "")
    try:
        ids = [int(x) for x in ids_param.split(",") if x.strip()]
    except ValueError:
        return _err("norad_ids must be comma-separated integers")
    if not ids:
        return _ok([])

    out = []
    for nid in ids:
        sat = _find_satellite_by_norad(nid)
        if sat:
            out.append(position_now(sat))
    return _ok(out)


@bp.get("/search")
def search():
    """Search across all default-visible groups by name or NORAD ID."""
    q = request.args.get("q", "").strip().lower()
    if len(q) < 2:
        return _err("Query must be at least 2 characters")

    matches = []
    for group in GROUPS:
        if not group.default_visible and group.id != "starlink":
            # Skip non-default groups except starlink (which is searched on demand)
            continue
        try:
            tles = _cache().get(group.id, lambda g=group: fetch_tles(g.query))
        except CelestrakError:
            continue
        for tle in tles:
            name = tle[0].lower()
            norad = _norad_from_tle(tle)
            if q in name or (norad is not None and q == str(norad)):
                matches.append({
                    "name": tle[0],
                    "norad_id": norad,
                    "group": group.id,
                })
                if len(matches) >= 50:
                    break
        if len(matches) >= 50:
            break
    return _ok(matches)


@bp.get("/cache/stats")
def cache_stats():
    return _ok(_cache().stats())


def _norad_from_tle(tle: tuple[str, str, str]) -> int | None:
    """Parse NORAD catalog number from TLE line 1 (cols 3-7)."""
    try:
        return int(tle[1][2:7])
    except (IndexError, ValueError):
        return None


def _find_satellite_by_norad(norad_id: int) -> EarthSatellite | None:
    """Find a satellite by NORAD ID via direct CATNR query (cached per id)."""
    try:
        tles = _cache().get(f"norad:{norad_id}", lambda: fetch_tles(f"CATNR={norad_id}"))
    except CelestrakError:
        return None
    if not tles:
        return None
    return build_satellite(tles[0])
