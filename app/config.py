"""Runtime configuration loaded from environment / .env file."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    secret_key: str
    tle_cache_ttl_seconds: int
    host: str
    port: int

    @classmethod
    def from_env(cls) -> Config:
        return cls(
            secret_key=os.getenv("FLASK_SECRET_KEY", "dev-secret-change-me"),
            tle_cache_ttl_seconds=int(os.getenv("TLE_CACHE_TTL_MINUTES", "120")) * 60,
            host=os.getenv("HOST", "127.0.0.1"),
            port=int(os.getenv("PORT", "5000")),
        )
