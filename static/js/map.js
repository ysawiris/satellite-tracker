// 2D map view backed by Leaflet + dark CartoDB tiles, with glowing satellite markers.

const TILE_DARK = "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &middot; &copy; <a href="https://carto.com/attributions">CARTO</a>';

export class MapView {
  constructor(containerId, { onSelect } = {}) {
    this.map = L.map(containerId, {
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 9,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    }).setView([20, 0], 2);

    this.tileLayer = L.tileLayer(TILE_DARK, {
      attribution: TILE_ATTR,
      subdomains: "abcd",
      noWrap: false,
    }).addTo(this.map);

    this.canvasRenderer = L.canvas({ padding: 0.5 });

    this.markers = new Map(); // norad_id -> Leaflet circleMarker
    this.observerMarker = null;
    this.selectedId = null;
    this.onSelect = onSelect || (() => {});
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
          html: `
            <div style="position:relative;width:18px;height:18px;">
              <div style="position:absolute;inset:0;border-radius:50%;background:#34d399;box-shadow:0 0 0 2px rgba(5,8,22,0.85), 0 0 16px rgba(52,211,153,0.8);"></div>
              <div style="position:absolute;inset:-6px;border-radius:50%;border:1.5px solid rgba(52,211,153,0.6);animation:obs-ping 2s ease-out infinite;"></div>
            </div>
            <style>@keyframes obs-ping { 0% {transform:scale(0.8);opacity:1;} 100% {transform:scale(2);opacity:0;} }</style>
          `,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      }).addTo(this.map);
      this.observerMarker.bindTooltip("You", { className: "sat-tooltip", direction: "top", offset: [0, -8] });
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
        existing._satMeta = sat;
      } else {
        const marker = L.circleMarker([sat.lat, sat.lon], {
          radius: 3.5,
          weight: 1.5,
          color: sat.color,
          fillColor: sat.color,
          fillOpacity: 0.85,
          opacity: 0.95,
          renderer: this.canvasRenderer,
        });
        marker.bindTooltip(sat.name, { className: "sat-tooltip", direction: "top", offset: [0, -4] });
        marker.on("click", () => this.onSelect(sat));
        marker._satMeta = sat;
        marker.addTo(this.map);
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
    // Reset previous selection
    if (this.selectedId != null && this.selectedId !== noradId) {
      const prev = this.markers.get(this.selectedId);
      if (prev) {
        const meta = prev._satMeta;
        prev.setStyle({
          radius: 3.5,
          weight: 1.5,
          color: meta?.color,
          fillColor: meta?.color,
          fillOpacity: 0.85,
        });
      }
    }
    this.selectedId = noradId;
    const marker = this.markers.get(noradId);
    if (!marker) return;
    marker.setStyle({
      radius: 7,
      weight: 2.5,
      color: "#fbbf24",
      fillColor: "#fbbf24",
      fillOpacity: 1,
    });
    marker.bringToFront();
  }

  panTo(lat, lon) {
    this.map.panTo([lat, lon], { animate: true });
  }
}
