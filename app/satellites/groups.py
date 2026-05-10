"""Satellite group definitions backed by CelesTrak GP queries.

Each group maps to a CelesTrak query (`GROUP=` or `CATNR=`) and a UI color.
See https://celestrak.org/NORAD/elements/ for the full catalog.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Group:
    id: str
    name: str
    query: str
    color: str
    default_visible: bool


GROUPS: tuple[Group, ...] = (
    Group("stations", "Space Stations", "GROUP=stations", "#3b82f6", True),
    Group("visual", "Brightest", "GROUP=visual", "#a3e635", True),
    Group("hubble", "Hubble", "CATNR=20580", "#ec4899", True),
    Group("weather", "Weather", "GROUP=weather", "#06b6d4", False),
    Group("noaa", "NOAA", "GROUP=noaa", "#0891b2", False),
    Group("gps", "GPS", "GROUP=gps-ops", "#f59e0b", False),
    Group("starlink", "Starlink", "GROUP=starlink", "#8b5cf6", False),
    Group("science", "Science", "GROUP=science", "#10b981", False),
    Group("geo", "Geostationary", "GROUP=geo", "#ef4444", False),
)

GROUPS_BY_ID: dict[str, Group] = {g.id: g for g in GROUPS}


def get_group(group_id: str) -> Group | None:
    return GROUPS_BY_ID.get(group_id)


def serialize_group(g: Group) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "color": g.color,
        "default_visible": g.default_visible,
    }
