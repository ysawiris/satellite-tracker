import pytest
import responses

from app.satellites.celestrak import CELESTRAK_GP_URL, CelestrakError, fetch_tles, parse_tle_text


def test_parse_tle_text_basic():
    text = """ISS (ZARYA)
1 25544U 98067A   24001.50000000  .00010000  00000-0  20000-3 0  9990
2 25544  51.6400 100.0000 0001000  90.0000 270.0000 15.50000000400000
HUBBLE SPACE TELESCOPE
1 20580U 90037B   24001.50000000  .00001000  00000-0  10000-3 0  9990
2 20580  28.4700 200.0000 0002000 100.0000 260.0000 15.10000000300000
"""
    tles = parse_tle_text(text)
    assert len(tles) == 2
    assert tles[0][0] == "ISS (ZARYA)"
    assert tles[0][1].startswith("1 25544")
    assert tles[1][0] == "HUBBLE SPACE TELESCOPE"


def test_parse_tle_text_skips_malformed():
    text = """JUNK LINE
not a tle line
also not a tle line
ISS (ZARYA)
1 25544U 98067A   24001.50000000  .00010000  00000-0  20000-3 0  9990
2 25544  51.6400 100.0000 0001000  90.0000 270.0000 15.50000000400000
"""
    tles = parse_tle_text(text)
    assert len(tles) == 1
    assert tles[0][0] == "ISS (ZARYA)"


@responses.activate
def test_fetch_tles_success():
    body = """ISS (ZARYA)
1 25544U 98067A   24001.50000000  .00010000  00000-0  20000-3 0  9990
2 25544  51.6400 100.0000 0001000  90.0000 270.0000 15.50000000400000
"""
    responses.add(responses.GET, CELESTRAK_GP_URL, body=body, status=200)
    tles = fetch_tles("CATNR=25544")
    assert len(tles) == 1
    assert tles[0][0] == "ISS (ZARYA)"


@responses.activate
def test_fetch_tles_empty_response():
    responses.add(responses.GET, CELESTRAK_GP_URL, body="No GP data found", status=200)
    with pytest.raises(CelestrakError):
        fetch_tles("CATNR=99999999")


@responses.activate
def test_fetch_tles_http_error():
    responses.add(responses.GET, CELESTRAK_GP_URL, status=500)
    with pytest.raises(CelestrakError):
        fetch_tles("GROUP=stations")


def test_fetch_tles_invalid_query():
    with pytest.raises(CelestrakError):
        fetch_tles("not-a-query")
