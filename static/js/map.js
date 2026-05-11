// 2D map view backed by Leaflet + dark CartoDB tiles, with satellite-shaped icons.

const TILE_DARK = "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &middot; &copy; <a href="https://carto.com/attributions">CARTO</a>';

const SAT_SVG = `<svg viewBox="0 0 18 10" width="18" height="10" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="2" width="4" height="6" opacity="0.45" rx="0.6"/>
  <rect x="14" y="2" width="4" height="6" opacity="0.45" rx="0.6"/>
  <rect x="4" y="4" width="2" height="2" opacity="0.55"/>
  <rect x="12" y="4" width="2" height="2" opacity="0.55"/>
  <rect x="6.5" y="1.5" width="5" height="7" rx="1.2"/>
  <rect x="7.8" y="3" width="2.4" height="4" fill="rgba(0,0,0,0.35)" rx="0.4"/>
</svg>`;

function makeIcon(color, { isSelected = false, allWeather = false } = {}) {
  const cls = ["sat-icon"];
  if (isSelected) cls.push("selected");
  if (allWeather) cls.push("all-weather");
  return L.divIcon({
    className: cls.join(" "),
    html: `<span style="color:${color};display:block;line-height:0;">${SAT_SVG}</span>`,
    iconSize: [18, 10],
    iconAnchor: [9, 5],
  });
}

export class MapView {
  constructor(containerId, { onSelect } = {}) {
    this.map = L.map(containerId, {
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 9,
      zoomControl: true,
      attributionControl: true,
    }).setView([20, 0], 2);

    this.tileLayer = L.tileLayer(TILE_DARK, {
      attribution: TILE_ATTR,
      subdomains: "abcd",
      noWrap: false,
    }).addTo(this.map);

    this.markers = new Map(); // norad_id -> Leaflet marker
    this.observerMarker = null;
    this.selectedId = null;
    this.terminatorLayer = null;
    this.sunMarker = null;
    this.orbitLayer = null;
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
              <div style="position:absolute;inset:0;border-radius:50%;background:#34d399;box-shadow:0 0 0 2px rgba(5,8,22,0.85), 0 0 16px rgba(52,211,153,0.85);"></div>
              <div style="position:absolute;inset:-6px;border-radius:50%;border:1.5px solid rgba(52,211,153,0.6);animation:obs-ping 2s ease-out infinite;"></div>
            </div>
            <style>@keyframes obs-ping { 0% {transform:scale(0.8);opacity:1;} 100% {transform:scale(2);opacity:0;} }</style>
          `,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        zIndexOffset: 500,
      }).addTo(this.map);
      this.observerMarker.bindTooltip("You", { className: "sat-tooltip", direction: "top", offset: [0, -10] });
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
        const marker = L.marker([sat.lat, sat.lon], {
          icon: makeIcon(sat.color, { allWeather: !!sat.all_weather }),
          riseOnHover: true,
        });
        marker.bindTooltip(sat.name, { className: "sat-tooltip", direction: "top", offset: [0, -8] });
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
    if (this.selectedId != null && this.selectedId !== noradId) {
      const prev = this.markers.get(this.selectedId);
      const el = prev?.getElement();
      if (el) el.classList.remove("selected");
      if (prev) prev.setZIndexOffset(0);
    }
    this.selectedId = noradId;
    const marker = this.markers.get(noradId);
    if (!marker) return;
    const el = marker.getElement();
    if (el) el.classList.add("selected");
    marker.setZIndexOffset(1000);
  }

  panTo(lat, lon) {
    this.map.panTo([lat, lon], { animate: true });
  }

  // ---- Day/night terminator ------------------------------------------------

  setTerminator(sunLat, sunLon) {
    // The terminator is the great circle whose pole is the sub-solar point.
    // We sample 360 points around it; at each longitude lon, the latitude
    // along the terminator solves: tan(lat) = -cos(lon - sunLon) / tan(sunLat).
    const samples = [];
    const phiSun = (sunLat * Math.PI) / 180;
    for (let i = 0; i <= 360; i += 1) {
      const lon = -180 + i;
      const dLon = ((lon - sunLon) * Math.PI) / 180;
      // Edge case: sun directly on equator (tan(0) = 0) — terminator is at lon±90 from sun.
      let lat;
      if (Math.abs(phiSun) < 1e-6) {
        lat = Math.cos(dLon) > 0 ? -89.9 : 89.9;
      } else {
        lat = Math.atan(-Math.cos(dLon) / Math.tan(phiSun)) * (180 / Math.PI);
      }
      samples.push([lat, lon]);
    }

    // Build a polygon enclosing the night side: walk the terminator, then
    // close off at the pole opposite the sun (north pole if sunLat < 0).
    const nightPoleLat = sunLat >= 0 ? -90 : 90;
    const ring = [...samples, [nightPoleLat, 180], [nightPoleLat, -180]];

    if (this.terminatorLayer) this.terminatorLayer.remove();
    this.terminatorLayer = L.polygon(ring, {
      stroke: true,
      color: "#0b1226",
      weight: 1.5,
      opacity: 0.55,
      fillColor: "#020616",
      fillOpacity: 0.55,
      interactive: false,
      className: "terminator-poly",
    }).addTo(this.map);
    this.terminatorLayer.bringToBack();
    this.tileLayer.bringToBack();

    // Sun marker — a small glowing disc at the sub-solar point.
    if (!this.sunMarker) {
      this.sunMarker = L.marker([sunLat, sunLon], {
        icon: L.divIcon({
          className: "",
          html: `
            <div style="position:relative;width:18px;height:18px;">
              <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle, #fde68a 0%, #f59e0b 60%, transparent 75%);box-shadow:0 0 28px rgba(251,191,36,0.85);"></div>
              <div style="position:absolute;inset:-8px;border-radius:50%;border:1px dashed rgba(251,191,36,0.45);animation:sun-rot 22s linear infinite;"></div>
            </div>
            <style>@keyframes sun-rot { to { transform: rotate(360deg); } }</style>
          `,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        zIndexOffset: 100,
        interactive: false,
      });
      this.sunMarker.addTo(this.map);
    } else {
      this.sunMarker.setLatLng([sunLat, sunLon]);
    }
  }

  // ---- Orbit trail ---------------------------------------------------------

  setOrbitTrail(samples, color) {
    this.clearOrbitTrail();
    if (!samples || samples.length < 2) return;

    // Split into segments where the longitude wraps around (≥180° jump),
    // otherwise Leaflet draws an ugly line straight across the map.
    const segments = [[]];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const prev = i > 0 ? samples[i - 1] : null;
      if (prev && Math.abs(s.lon - prev.lon) > 180) segments.push([]);
      segments[segments.length - 1].push([s.lat, s.lon]);
    }

    this.orbitLayer = L.layerGroup(
      segments.filter((seg) => seg.length > 1).map((seg) =>
        L.polyline(seg, {
          color: color || "#fbbf24",
          weight: 2,
          opacity: 0.85,
          interactive: false,
          dashArray: "4 6",
          className: "orbit-trail",
        })
      )
    ).addTo(this.map);
  }

  clearOrbitTrail() {
    if (this.orbitLayer) {
      this.orbitLayer.remove();
      this.orbitLayer = null;
    }
  }
}
