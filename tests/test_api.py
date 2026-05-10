
import responses

from app.satellites.celestrak import CELESTRAK_GP_URL

ISS_TLE_BODY = """ISS (ZARYA)
1 25544U 98067A   24001.50000000  .00010000  00000-0  20000-3 0  9990
2 25544  51.6400 100.0000 0001000  90.0000 270.0000 15.50000000400000
"""


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json == {"status": "ok"}


def test_index_renders(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Satellite Tracker" in resp.data


def test_groups_endpoint(client):
    resp = client.get("/api/groups")
    assert resp.status_code == 200
    body = resp.json
    assert body["error"] is None
    assert isinstance(body["data"], list)
    ids = [g["id"] for g in body["data"]]
    assert "stations" in ids
    assert "starlink" in ids


def test_unknown_group_returns_404(client):
    resp = client.get("/api/groups/not-a-group/satellites")
    assert resp.status_code == 404
    assert "Unknown group" in resp.json["error"]


@responses.activate
def test_group_satellites_returns_positions(client):
    responses.add(responses.GET, CELESTRAK_GP_URL, body=ISS_TLE_BODY, status=200)

    resp = client.get("/api/groups/hubble/satellites")
    assert resp.status_code == 200
    body = resp.json
    assert body["error"] is None
    assert len(body["data"]) == 1
    sat = body["data"][0]
    assert sat["name"] == "ISS (ZARYA)"
    assert sat["norad_id"] == 25544
    assert sat["group"] == "hubble"
    assert "lat" in sat and "lon" in sat


@responses.activate
def test_satellite_detail(client):
    responses.add(responses.GET, CELESTRAK_GP_URL, body=ISS_TLE_BODY, status=200)
    resp = client.get("/api/satellites/25544")
    assert resp.status_code == 200
    assert resp.json["data"]["norad_id"] == 25544


def test_passes_requires_lat_lon(client):
    resp = client.get("/api/satellites/25544/passes")
    assert resp.status_code == 400
    assert "lat" in resp.json["error"]


@responses.activate
def test_positions_endpoint(client):
    responses.add(responses.GET, CELESTRAK_GP_URL, body=ISS_TLE_BODY, status=200)
    resp = client.get("/api/positions?norad_ids=25544")
    assert resp.status_code == 200
    assert resp.json["data"][0]["norad_id"] == 25544


def test_positions_empty(client):
    resp = client.get("/api/positions")
    assert resp.status_code == 200
    assert resp.json["data"] == []


def test_search_too_short(client):
    resp = client.get("/api/search?q=a")
    assert resp.status_code == 400
