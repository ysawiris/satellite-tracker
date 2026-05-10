"""In-memory TLE cache with TTL.

CelesTrak asks clients to cache for two hours minimum; we default to that and
allow the TTL to be overridden through configuration.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable

from .celestrak import TLE


class TLECache:
    def __init__(self, ttl_seconds: int = 7200) -> None:
        self.ttl = ttl_seconds
        self._entries: dict[str, tuple[float, list[TLE]]] = {}
        self._lock = threading.RLock()

    def get(self, key: str, fetcher: Callable[[], list[TLE]]) -> list[TLE]:
        now = time.time()
        with self._lock:
            entry = self._entries.get(key)
            if entry and now - entry[0] < self.ttl:
                return entry[1]
        # Fetch outside the lock so concurrent fetches of different groups don't block.
        data = fetcher()
        with self._lock:
            self._entries[key] = (time.time(), data)
        return data

    def invalidate(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._entries.clear()
            else:
                self._entries.pop(key, None)

    def stats(self) -> dict[str, dict]:
        now = time.time()
        with self._lock:
            return {
                key: {"count": len(tles), "age_seconds": int(now - ts)}
                for key, (ts, tles) in self._entries.items()
            }
