import time

from app.satellites.tle_cache import TLECache


def test_cache_returns_fetched_value():
    cache = TLECache(ttl_seconds=60)
    calls = {"n": 0}

    def fetch():
        calls["n"] += 1
        return [("A", "1 ...", "2 ...")]

    assert cache.get("k", fetch) == [("A", "1 ...", "2 ...")]
    assert cache.get("k", fetch) == [("A", "1 ...", "2 ...")]
    assert calls["n"] == 1


def test_cache_expires_after_ttl():
    cache = TLECache(ttl_seconds=0)
    calls = {"n": 0}

    def fetch():
        calls["n"] += 1
        return []

    cache.get("k", fetch)
    time.sleep(0.01)
    cache.get("k", fetch)
    assert calls["n"] == 2


def test_cache_invalidate_specific_key():
    cache = TLECache(ttl_seconds=60)
    cache.get("a", lambda: [("A", "", "")])
    cache.get("b", lambda: [("B", "", "")])
    cache.invalidate("a")

    refetches = {"n": 0}

    def fetch_a():
        refetches["n"] += 1
        return [("A2", "", "")]

    cache.get("a", fetch_a)
    cache.get("b", lambda: [("X", "", "")])  # Should not refetch b.
    assert refetches["n"] == 1


def test_cache_stats_reports_entries():
    cache = TLECache(ttl_seconds=60)
    cache.get("a", lambda: [("A", "", "")])
    stats = cache.stats()
    assert "a" in stats
    assert stats["a"]["count"] == 1
    assert stats["a"]["age_seconds"] >= 0
