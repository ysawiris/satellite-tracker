// 2D map view backed by Leaflet + OpenStreetMap.

const TILE_LIGHT = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_DARK = "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png";
const TILE_ATTR = '&copy; OpenStreetMap contributors';

export class MapView {
  constructor(containerId, { onSelect } = {}) {
    this.map = L.map(containerId, {
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 9,
      zoomControl: true,
    }).setView([20, 0], 2);

    this.tileLayer = L.tileLayer(this._tileForTheme(), {
      attribution: TILE_ATTR,
      subdomains: "abc",
      noWrap: false,
    }).addTo(this.map);

    this.markers = new Map(); // norad_id -> Leaflet circleMarker
    this.observerMarker = null;
    this.onSelect = onSelect || (() => {});
    this._setupThemeWatcher();
  }

  _tileForTheme() {
    return document.documentElement.classList.contains("dark") ? TILE_DARK : TILE_LIGHT;
  }

  _setupThemeWatcher() {
    new MutationObserver(() => {
      this.tileLayer.setUrl(this._tileForTheme());
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  resize() {
    this.map.invalidateSize();
  }

  setObserver(lat, lon) {
    if (lat == null || lon == null) {
      if (this.observerMarker) {
        this.observerMarker.remove();
        this.observerMarker = null;
      }
      return;
    }
    if (!this.observerMarker) {
      this.observerMarker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid white;box-shadow:0 0 6px rgba(34,197,94,0.7);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      }).addTo(this.map);
      this.observerMarker.bindTooltip("You", { permanent: false });
    } else {
      this.observerMarker.setLatLng([lat, lon]);
    }
  }

  upsertSatellites(satellites) {
    const seen = new Set();
    for (const sat of satellites) {
      seen.add(sat.norad_id);
      const existing = this.markers.get(sat.norad_id);
      if (existing) {
        existing.setLatLng([sat.lat, sat.lon]);
      } else {
        const marker = L.circleMarker([sat.lat, sat.lon], {
          radius: 4,
          weight: 1,
          color: "white",
          fillColor: sat.color,
          fillOpacity: 0.9,
          className: "satellite-marker",
        });
        marker.bindTooltip(sat.name, { className: "sat-tooltip", direction: "top", offset: [0, -4] });
        marker.on("click", () => this.onSelect(sat));
        marker.addTo(this.map);
        marker._satMeta = sat;
        this.markers.set(sat.norad_id, marker);
      }
    }
    return seen;
  }

  removeSatellitesNotIn(keepIds) {
    for (const [id, marker] of this.markers) {
      if (!keepIds.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    }
  }

  highlight(noradId) {
    for (const [id, marker] of this.markers) {
      const meta = marker._satMeta;
      marker.setStyle({
        radius: id === noradId ? 7 : 4,
        weight: id === noradId ? 2 : 1,
        color: id === noradId ? "#facc15" : "white",
        fillColor: meta ? meta.color : marker.options.fillColor,
      });
      if (id === noradId) marker.bringToFront();
    }
  }

  panTo(lat, lon) {
    this.map.panTo([lat, lon], { animate: true });
  }
}
