from app.satellites.metadata import RADAR_SATS, get_sensor_info


def test_known_radar_sat_is_all_weather():
    info = get_sensor_info(39634)  # Sentinel-1A
    assert info.sensor_type == "radar"
    assert info.all_weather is True
    assert "Sentinel-1A" in info.description


def test_radar_lookup_overrides_group_default():
    # If a radar sat ends up in some group, the radar metadata still wins.
    info = get_sensor_info(39634, group_id="weather")
    assert info.sensor_type == "radar"
    assert info.all_weather is True


def test_group_fallback_weather():
    info = get_sensor_info(99999999, group_id="weather")
    assert info.sensor_type == "ir"
    assert info.all_weather is False


def test_group_fallback_gps_is_all_weather():
    info = get_sensor_info(99999999, group_id="gps")
    assert info.sensor_type == "navigation"
    assert info.all_weather is True


def test_unknown_satellite_returns_unknown():
    info = get_sensor_info(99999999)
    assert info.sensor_type == "unknown"
    assert info.all_weather is False


def test_radar_sat_list_no_duplicates_or_empty_names():
    assert all(name for name in RADAR_SATS.values())
    # Spot-check that we have a healthy variety
    assert len(RADAR_SATS) >= 20
