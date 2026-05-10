"""Flask app factory.

Run locally: `flask --app app.main run --debug`
Production: `gunicorn 'app.main:create_app()'`
"""

from __future__ import annotations

import logging

from flask import Flask, render_template

from .api import bp as api_bp
from .config import Config
from .satellites.groups import GROUPS, serialize_group
from .satellites.tle_cache import TLECache


def create_app(config: Config | None = None) -> Flask:
    config = config or Config.from_env()

    app = Flask(__name__, static_folder="../static", template_folder="../templates")
    app.config["SECRET_KEY"] = config.secret_key
    app.extensions["tle_cache"] = TLECache(ttl_seconds=config.tle_cache_ttl_seconds)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    app.register_blueprint(api_bp)

    @app.route("/")
    def index():
        return render_template(
            "index.html",
            groups=[serialize_group(g) for g in GROUPS],
        )

    @app.route("/health")
    def health():
        return {"status": "ok"}

    return app


if __name__ == "__main__":
    cfg = Config.from_env()
    create_app(cfg).run(host=cfg.host, port=cfg.port, debug=True)
