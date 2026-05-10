"""CelesTrak GP TLE client.

CelesTrak is the canonical free source for orbital elements. It does not
require authentication, but asks clients to identify themselves with a
User-Agent and cache responses for at least two hours. See
https://celestrak.org/NORAD/documentation/gp-data-formats.php
"""

from __future__ import annotations

import logging

import requests

logger = logging.getLogger(__name__)

CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php"
USER_AGENT = "satellite-tracker/0.1 (+https://github.com/ysawiris/satellite-tracker)"
TIMEOUT_SECONDS = 30


TLE = tuple[str, str, str]


class CelestrakError(RuntimeError):
    """Raised when CelesTrak returns an unexpected response."""


def parse_tle_text(text: str) -> list[TLE]:
    """Parse 3LE text into (name, line1, line2) tuples."""
    lines = [line.rstrip() for line in text.strip().splitlines() if line.strip()]
    out: list[TLE] = []
    i = 0
    while i + 2 < len(lines) + 1:
        if i + 2 >= len(lines):
            break
        name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 "):
            out.append((name.strip(), l1, l2))
            i += 3
        else:
            i += 1
    return out


def fetch_tles(query: str) -> list[TLE]:
    """Fetch TLEs for a CelesTrak query string like 'GROUP=stations' or 'CATNR=25544'.

    Raises CelestrakError on HTTP failures or empty responses.
    """
    key, _, value = query.partition("=")
    if not value:
        raise CelestrakError(f"Invalid query: {query!r}")

    params = {key: value, "FORMAT": "tle"}
    logger.info("Fetching CelesTrak TLEs: %s", params)
    try:
        resp = requests.get(
            CELESTRAK_GP_URL,
            params=params,
            timeout=TIMEOUT_SECONDS,
            headers={"User-Agent": USER_AGENT},
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise CelestrakError(f"CelesTrak request failed: {exc}") from exc

    body = resp.text
    if "No GP data found" in body or len(body.strip()) < 10:
        raise CelestrakError(f"CelesTrak returned no data for {query!r}")

    tles = parse_tle_text(body)
    if not tles:
        raise CelestrakError(f"CelesTrak response had no parseable TLEs for {query!r}")
    logger.info("Parsed %d TLEs for %s", len(tles), query)
    return tles
