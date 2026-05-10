import pytest

from app.config import Config
from app.main import create_app


@pytest.fixture
def app():
    cfg = Config(secret_key="test", tle_cache_ttl_seconds=60, host="127.0.0.1", port=0)
    return create_app(cfg)


@pytest.fixture
def client(app):
    return app.test_client()


# Sample ISS TLE — fixed epoch so tests are deterministic.
ISS_TLE = (
    "ISS (ZARYA)",
    "1 25544U 98067A   24001.50000000  .00010000  00000-0  20000-3 0  9990",
    "2 25544  51.6400 100.0000 0001000  90.0000 270.0000 15.50000000400000",
)


@pytest.fixture
def iss_tle():
    return ISS_TLE
