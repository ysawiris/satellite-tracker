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


# ============================================================================
# Imagery providers — what you can do with photos from this satellite.
# ============================================================================


@dataclass(frozen=True)
class ImageryInfo:
    """Where to find / buy imagery from this satellite."""
    provider: str           # "USGS / NASA Worldview", "Maxar", etc.
    free: bool              # True = open data; False = commercial
    url: str                # Landing page or deep-link template
    description: str = ""
    # If True, the URL contains {lat}/{lon}/{date} placeholders that the
    # frontend should substitute with the observer's location and today's date.
    deep_link: bool = False


# Free / open-data satellites (the good guys).
_FREE_IMAGERY: dict[int, ImageryInfo] = {
    # ---------- Landsat (USGS / NASA, free since 2008) -----------------------
    39084: ImageryInfo(
        "USGS EarthExplorer", True,
        "https://earthexplorer.usgs.gov/",
        "Landsat-8 OLI/TIRS · 30 m multispectral, 100 m thermal · free since 2008",
    ),
    49260: ImageryInfo(
        "USGS EarthExplorer", True,
        "https://earthexplorer.usgs.gov/",
        "Landsat-9 OLI-2/TIRS-2 · 30 m multispectral · free + global revisit",
    ),
    # ---------- Sentinel (ESA Copernicus, fully free) ------------------------
    39634: ImageryInfo(  # Sentinel-1A
        "Copernicus Browser", True,
        "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=10&datasetId=S1_GRD_IW",
        "Sentinel-1A · C-band SAR · 5–20 m, all-weather, free under Copernicus",
        deep_link=True,
    ),
    62261: ImageryInfo(  # Sentinel-1C
        "Copernicus Browser", True,
        "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=10&datasetId=S1_GRD_IW",
        "Sentinel-1C · C-band SAR · all-weather, free under Copernicus",
        deep_link=True,
    ),
    40697: ImageryInfo(  # Sentinel-2A
        "Copernicus Browser", True,
        "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=10&datasetId=S2L2A",
        "Sentinel-2A · 10 m multispectral · 5-day revisit · free",
        deep_link=True,
    ),
    42063: ImageryInfo(  # Sentinel-2B
        "Copernicus Browser", True,
        "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=10&datasetId=S2L2A",
        "Sentinel-2B · 10 m multispectral · pairs with 2A for 5-day revisit",
        deep_link=True,
    ),
    60989: ImageryInfo(  # Sentinel-2C
        "Copernicus Browser", True,
        "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=10&datasetId=S2L2A",
        "Sentinel-2C · 10 m multispectral · launched 2024, free",
        deep_link=True,
    ),
    41335: ImageryInfo(  # Sentinel-3A
        "Copernicus Browser", True,
        "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=6&datasetId=S3OLCI",
        "Sentinel-3A · 300 m ocean / land color · daily global coverage · free",
        deep_link=True,
    ),
    43437: ImageryInfo(  # Sentinel-3B
        "Copernicus Browser", True,
        "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=6&datasetId=S3OLCI",
        "Sentinel-3B · 300 m ocean / land color · pairs with 3A · free",
        deep_link=True,
    ),
    42969: ImageryInfo(  # Sentinel-5P
        "Copernicus Browser", True,
        "https://browser.dataspace.copernicus.eu/?lat={lat}&lng={lon}&zoom=4&datasetId=S5_NO2",
        "Sentinel-5P TROPOMI · atmospheric NO₂, ozone, methane · free",
        deep_link=True,
    ),
    # ---------- MODIS (NASA, free) -------------------------------------------
    27424: ImageryInfo(  # Aqua
        "NASA Worldview", True,
        "https://worldview.earthdata.nasa.gov/?v={lon_w},{lat_s},{lon_e},{lat_n}&l=MODIS_Aqua_CorrectedReflectance_TrueColor",
        "MODIS Aqua · 250 m–1 km true color · daily global · free",
        deep_link=True,
    ),
    25994: ImageryInfo(  # Terra
        "NASA Worldview", True,
        "https://worldview.earthdata.nasa.gov/?v={lon_w},{lat_s},{lon_e},{lat_n}&l=MODIS_Terra_CorrectedReflectance_TrueColor",
        "MODIS Terra · 250 m–1 km true color · daily global · free",
        deep_link=True,
    ),
    # ---------- VIIRS (NASA / NOAA, free) ------------------------------------
    37849: ImageryInfo(  # Suomi NPP
        "NASA Worldview", True,
        "https://worldview.earthdata.nasa.gov/?v={lon_w},{lat_s},{lon_e},{lat_n}&l=VIIRS_SNPP_CorrectedReflectance_TrueColor",
        "VIIRS Suomi NPP · 375 m true color · daily, plus night-lights · free",
        deep_link=True,
    ),
    43013: ImageryInfo(  # NOAA-20
        "NASA Worldview", True,
        "https://worldview.earthdata.nasa.gov/?v={lon_w},{lat_s},{lon_e},{lat_n}&l=VIIRS_NOAA20_CorrectedReflectance_TrueColor",
        "VIIRS NOAA-20 · 375 m true color · daily · free",
        deep_link=True,
    ),
    # ---------- GOES geostationary (NOAA, free, real-time) -------------------
    41866: ImageryInfo(  # GOES-16 (East)
        "NOAA RAMMB SLIDER", True,
        "https://rammb-slider.cira.colostate.edu/?sat=goes-16&sec=full_disk",
        "GOES-16 (East) · ABI · full-disk every 10 min, real-time weather · free",
    ),
    43226: ImageryInfo(  # GOES-17
        "NOAA RAMMB SLIDER", True,
        "https://rammb-slider.cira.colostate.edu/?sat=goes-17&sec=full_disk",
        "GOES-17 · ABI · full-disk every 10 min · free",
    ),
    51850: ImageryInfo(  # GOES-18 (West)
        "NOAA RAMMB SLIDER", True,
        "https://rammb-slider.cira.colostate.edu/?sat=goes-18&sec=full_disk",
        "GOES-18 (West) · ABI · full-disk every 10 min · free",
    ),
    # ---------- Himawari (JMA, free) -----------------------------------------
    40267: ImageryInfo(  # Himawari-8
        "JMA Himawari Real-Time Web", True,
        "https://www.jma.go.jp/bosai/map.html#contents=himawari",
        "Himawari-8 · AHI · 10-min full-disk for Asia/Pacific · free",
    ),
    49055: ImageryInfo(  # Himawari-9
        "JMA Himawari Real-Time Web", True,
        "https://www.jma.go.jp/bosai/map.html#contents=himawari",
        "Himawari-9 · AHI · 10-min full-disk · free",
    ),
    # ---------- ISS (NASA astronaut photography) -----------------------------
    25544: ImageryInfo(
        "NASA Earth Observations Lab", True,
        "https://eol.jsc.nasa.gov/SearchPhotos/",
        "Astronaut-shot photographs from the cupola — searchable archive of 4M+ images",
    ),
    # ---------- Hubble (astronomy, not Earth, but it's iconic) ---------------
    20580: ImageryInfo(
        "Hubble Legacy Archive", True,
        "https://hla.stsci.edu/",
        "Looks outward at galaxies, nebulae, planets — not Earth imagery",
    ),
}


# Commercial (paid) imagery satellites — link to where to buy.
_PAID_IMAGERY: dict[int, ImageryInfo] = {
    # ---------- Maxar (WorldView + GeoEye) -----------------------------------
    32060: ImageryInfo("Maxar", False, "https://www.maxar.com/products/satellite-imagery",
                      "WorldView-1 · 50 cm panchromatic · commercial"),
    35946: ImageryInfo("Maxar", False, "https://www.maxar.com/products/satellite-imagery",
                      "WorldView-2 · 46 cm pan / 1.85 m 8-band multispectral · commercial"),
    40115: ImageryInfo("Maxar", False, "https://www.maxar.com/products/satellite-imagery",
                      "WorldView-3 · 31 cm pan / 1.24 m 8-band + SWIR · commercial"),
    41848: ImageryInfo("Maxar", False, "https://www.maxar.com/products/satellite-imagery",
                      "WorldView-4 · 31 cm pan · commercial (decommissioned 2019, archive only)"),
    33331: ImageryInfo("Maxar", False, "https://www.maxar.com/products/satellite-imagery",
                      "GeoEye-1 · 41 cm pan / 1.65 m multispectral · commercial"),
    # ---------- Airbus (Pléiades + SPOT) -------------------------------------
    38012: ImageryInfo("Airbus OneAtlas", False, "https://oneatlas.airbus.com/",
                      "Pléiades-1A · 50 cm pan / 2 m 4-band · commercial"),
    39019: ImageryInfo("Airbus OneAtlas", False, "https://oneatlas.airbus.com/",
                      "Pléiades-1B · 50 cm pan / 2 m 4-band · commercial"),
    38755: ImageryInfo("Airbus OneAtlas", False, "https://oneatlas.airbus.com/",
                      "SPOT-6 · 1.5 m pan / 6 m multispectral · commercial"),
    40053: ImageryInfo("Airbus OneAtlas", False, "https://oneatlas.airbus.com/",
                      "SPOT-7 · 1.5 m pan / 6 m multispectral · commercial"),
    # ---------- Planet Labs (Dove + SkySat) ----------------------------------
    # SkySats — high-res commercial
    39418: ImageryInfo("Planet", False, "https://www.planet.com/products/",
                      "SkySat-1 · 72 cm pan / 1 m multispectral · commercial"),
    40072: ImageryInfo("Planet", False, "https://www.planet.com/products/",
                      "SkySat-2 · 72 cm pan / 1 m multispectral · commercial"),
    # ICEYE / Capella — SAR, both data programs (research-free for some, commercial for full archive)
    43800: ImageryInfo("ICEYE", False, "https://www.iceye.com/satellite-data/products",
                      "ICEYE X-band SAR · 0.5–1 m, all-weather · commercial (research access available)"),
    46269: ImageryInfo("Capella Space", False, "https://www.capellaspace.com/",
                      "Capella X-band SAR · 0.5 m, all-weather · commercial"),
    # BlackSky
    44035: ImageryInfo("BlackSky", False, "https://www.blacksky.com/products/imagery/",
                      "BlackSky Global · 1 m multispectral · commercial, high-cadence"),
    47422: ImageryInfo("BlackSky", False, "https://www.blacksky.com/products/imagery/",
                      "BlackSky Global · 1 m · commercial"),
}


# Family-prefix matchers for satellites where individual NORAD IDs are too
# numerous to enumerate (Planet's Dove constellation has hundreds).
_FAMILY_MATCHERS: tuple[tuple[str, ImageryInfo], ...] = (
    ("FLOCK ", ImageryInfo("Planet", False, "https://www.planet.com/products/",
                           "Planet Dove (Flock) · 3 m daily global · commercial")),
    ("DOVE-", ImageryInfo("Planet", False, "https://www.planet.com/products/",
                          "Planet Dove · 3 m · commercial")),
    ("SUPERDOVE ", ImageryInfo("Planet", False, "https://www.planet.com/products/",
                                "Planet SuperDove · 3 m 8-band · commercial")),
    ("SKYSAT-", ImageryInfo("Planet", False, "https://www.planet.com/products/",
                             "Planet SkySat · 50 cm · commercial")),
    ("ICEYE-", ImageryInfo("ICEYE", False, "https://www.iceye.com/satellite-data/products",
                            "ICEYE X-band SAR · all-weather · commercial")),
    ("CAPELLA-", ImageryInfo("Capella Space", False, "https://www.capellaspace.com/",
                              "Capella X-band SAR · 0.5 m all-weather · commercial")),
    ("BLACKSKY ", ImageryInfo("BlackSky", False, "https://www.blacksky.com/products/imagery/",
                               "BlackSky Global · 1 m · commercial")),
    ("STARLINK", None),  # Sentinel — Starlink doesn't take Earth photos, mark as no-imagery
)


def get_imagery_info(norad_id: int, name: str | None = None) -> ImageryInfo | None:
    """Return imagery-provider info for a satellite, or None if not catalogued."""
    if norad_id in _FREE_IMAGERY:
        return _FREE_IMAGERY[norad_id]
    if norad_id in _PAID_IMAGERY:
        return _PAID_IMAGERY[norad_id]
    if name:
        upper = name.upper()
        for prefix, info in _FAMILY_MATCHERS:
            if upper.startswith(prefix):
                return info
    return None


def serialize_imagery(info: ImageryInfo | None) -> dict | None:
    if info is None:
        return None
    return {
        "provider": info.provider,
        "free": info.free,
        "url": info.url,
        "description": info.description,
        "deep_link": info.deep_link,
    }
