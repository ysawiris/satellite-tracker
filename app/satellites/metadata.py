"""Curated sensor-type metadata for satellites.

Used to classify whether a satellite can observe Earth's surface through
clouds. Synthetic Aperture Radar (SAR) satellites can image through any
weather; optical and infrared sensors are blocked by clouds.

The list is intentionally small but high-confidence — it covers the
well-known SAR fleet (Sentinel-1, RADARSAT, COSMO-SkyMed, ICEYE, Capella,
SAOCOM, TerraSAR-X). For everything else we fall back to a per-group
default (e.g. weather group → IR, GPS group → navigation).
"""

from __future__ import annotations

from dataclasses import dataclass

SENSOR_TYPES = ("optical", "ir", "radar", "comms", "navigation", "unknown")


@dataclass(frozen=True)
class SensorInfo:
    sensor_type: str
    all_weather: bool
    description: str = ""


# NORAD CAT IDs of all-weather (synthetic aperture radar) satellites.
# Curated from public mission databases.
RADAR_SATS: dict[int, str] = {
    # ESA Copernicus Sentinel-1 (C-band SAR)
    39634: "Sentinel-1A",
    62261: "Sentinel-1C",
    # MDA RADARSAT (C-band SAR)
    32382: "RADARSAT-2",
    44322: "RADARSAT Constellation 1",
    44323: "RADARSAT Constellation 2",
    44324: "RADARSAT Constellation 3",
    # ASI / CONAE COSMO-SkyMed (X-band SAR)
    31598: "COSMO-SkyMed 1",
    32376: "COSMO-SkyMed 2",
    33412: "COSMO-SkyMed 3",
    37216: "COSMO-SkyMed 4",
    49260: "COSMO-SkyMed 2nd Gen FM-1",
    52937: "COSMO-SkyMed 2nd Gen FM-2",
    # CONAE SAOCOM (L-band SAR)
    43641: "SAOCOM-1A",
    46265: "SAOCOM-1B",
    # DLR / Airbus TerraSAR-X / TanDEM-X (X-band SAR)
    31698: "TerraSAR-X",
    36605: "TanDEM-X",
    # Spain PAZ (X-band SAR)
    43653: "PAZ-1",
    # ICEYE constellation (X-band SAR, NewSpace)
    43800: "ICEYE-X1",
    43801: "ICEYE-X2",
    44390: "ICEYE-X4",
    44391: "ICEYE-X5",
    46497: "ICEYE-X6",
    46498: "ICEYE-X7",
    48916: "ICEYE-X8",
    48917: "ICEYE-X9",
    # Capella Space (X-band SAR, NewSpace)
    46269: "Capella-2",
    47498: "Capella-3",
    47499: "Capella-4",
    47999: "Capella-5",
    48000: "Capella-6",
    50979: "Capella-7",
    50980: "Capella-8",
    # JAXA ALOS-2 (L-band SAR)
    39766: "ALOS-2",
}


# Per-group fallback sensor classification.
GROUP_FALLBACKS: dict[str, SensorInfo] = {
    "weather": SensorInfo("ir", False, "Infrared/visible weather imagery — blocked by thick clouds"),
    "noaa": SensorInfo("ir", False, "NOAA polar weather imager"),
    "gps": SensorInfo("navigation", True, "GPS signals pass through any weather"),
    "starlink": SensorInfo("comms", True, "Comms link works through clouds"),
    "geo": SensorInfo("comms", True, "Geostationary comms"),
    "stations": SensorInfo("optical", False, "Crewed station — windows + cameras"),
    "hubble": SensorInfo("optical", False, "Astronomy telescope — looks outward"),
    "science": SensorInfo("unknown", False, ""),
    "visual": SensorInfo("unknown", False, ""),
}


def get_sensor_info(norad_id: int, group_id: str | None = None) -> SensorInfo:
    """Return sensor metadata for a satellite, falling back to group defaults."""
    if norad_id in RADAR_SATS:
        return SensorInfo("radar", True, f"{RADAR_SATS[norad_id]} (SAR — sees through clouds)")
    if group_id and group_id in GROUP_FALLBACKS:
        return GROUP_FALLBACKS[group_id]
    return SensorInfo("unknown", False)
