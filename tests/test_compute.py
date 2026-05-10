from app.satellites.compute import build_satellite, position_now, predict_passes


def test_build_satellite_returns_named_object(iss_tle):
    sat = build_satellite(iss_tle)
    assert sat.name == "ISS (ZARYA)"
    assert int(sat.model.satnum) == 25544


def test_position_now_has_expected_shape(iss_tle):
    sat = build_satellite(iss_tle)
    pos = position_now(sat)

    assert pos["name"] == "ISS (ZARYA)"
    assert pos["norad_id"] == 25544
    assert -90 <= pos["lat"] <= 90
    assert -180 <= pos["lon"] <= 180
    assert 200 < pos["alt_km"] < 1500  # ISS altitude band
    assert 5 < pos["velocity_kms"] < 10  # ISS orbital velocity
    assert pos["epoch"].endswith("Z")


def test_predict_passes_returns_list(iss_tle):
    sat = build_satellite(iss_tle)
    # San Francisco — high probability of ISS passes.
    passes = predict_passes(sat, lat=37.7749, lon=-122.4194, days=2)

    assert isinstance(passes, list)
    for p in passes:
        assert "rise_utc" in p
        assert "set_utc" in p
        assert p["max_altitude_deg"] >= 10.0
        assert p["duration_seconds"] > 0


def test_predict_passes_respects_min_altitude(iss_tle):
    sat = build_satellite(iss_tle)
    high_passes = predict_passes(sat, lat=37.7749, lon=-122.4194, days=5, min_altitude_deg=70)
    for p in high_passes:
        assert p["max_altitude_deg"] >= 70
