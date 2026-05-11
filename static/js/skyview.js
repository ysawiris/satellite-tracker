// Observer-centered polar sky radar (alt/az). North up, zenith at center,
// horizon at the rim. Live satellite positions get plotted client-side by
// converting (sat lat, lon, alt) + observer (lat, lon) → topocentric alt/az.
// Pass arcs come from the server's /api/satellites/<id>/skytrack endpoint.

const SVG_NS = "http://www.w3.org/2000/svg";
const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * Topocentric alt/az from observer to satellite.
 * Uses the spherical-triangle formulation — accurate to ~0.05° for LEO/MEO/GEO,
 * which is invisible against the radar's 1° tick spacing.
 */
function altAzFrom(obsLat, obsLon, satLat, satLon, satAltKm) {
  const lat1 = obsLat * DEG;
  const lat2 = satLat * DEG;
  const dLon = (satLon - obsLon) * DEG;
  const sinLat1 = Math.sin(lat1), cosLat1 = Math.cos(lat1);
  const sinLat2 = Math.sin(lat2), cosLat2 = Math.cos(lat2);

  const cosC = Math.max(-1, Math.min(1, sinLat1 * sinLat2 + cosLat1 * cosLat2 * Math.cos(dLon)));
  const c = Math.acos(cosC);                      // central angle (rad)
  const Rh = EARTH_RADIUS_KM + satAltKm;
  const altRad = Math.atan2(Rh * Math.cos(c) - EARTH_RADIUS_KM, Rh * Math.sin(c));

  const y = Math.sin(dLon) * cosLat2;
  const x = cosLat1 * sinLat2 - sinLat1 * cosLat2 * Math.cos(dLon);
  const azDeg = (Math.atan2(y, x) * RAD + 360) % 360;
  return { alt: altRad * RAD, az: azDeg };
}

/** alt/az → (x, y) on the dial. Returns null if below horizon. */
function projectAltAz(alt, az, radius) {
  if (alt < 0) return null;
  const r = ((90 - alt) / 90) * radius;
  const a = az * DEG;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}

export class SkyView {
  constructor(containerId, { onSelect } = {}) {
    this.container = document.getElementById(containerId);
    this.onSelect = onSelect || (() => {});
    this.observer = null;
    this.satellites = [];
    this.selectedId = null;
    this.passArc = null;
    this._size = 0;

    this._svg = document.createElementNS(SVG_NS, "svg");
    this._svg.classList.add("skyview-svg");
    this._svg.setAttribute("xmlns", SVG_NS);
    this._svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.container.appendChild(this._svg);

    this._tooltip = document.createElement("div");
    this._tooltip.className = "skyview-tooltip";
    this._tooltip.style.display = "none";
    this.container.appendChild(this._tooltip);

    this._empty = document.createElement("div");
    this._empty.className = "skyview-empty";
    this._empty.innerHTML = `
      <div class="skyview-empty-icon">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>
          <path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>
        </svg>
      </div>
      <div class="skyview-empty-title">Set your location to see the sky</div>
      <div class="skyview-empty-text">Use the Observer panel or the locate-me button. Once your lat/lon is set, every satellite currently above your horizon will appear on this dial.</div>
    `;
    this.container.appendChild(this._empty);

    this._resize = this._resize.bind(this);
    window.addEventListener("resize", this._resize);
    this._resize();
  }

  // ---- Public API ---------------------------------------------------------

  setObserver(lat, lon) {
    this.observer = (lat == null || lon == null) ? null : { lat, lon };
    this._render();
  }

  setSatellites(sats) {
    this.satellites = sats || [];
    this._render();
  }

  setSelected(noradId) {
    this.selectedId = noradId;
    this._render();
  }

  setPassArc(samples) {
    this.passArc = samples || null;
    this._render();
  }

  clearPassArc() {
    this.passArc = null;
    this._render();
  }

  resize() { this._resize(); }

  // ---- Layout -------------------------------------------------------------

  _resize() {
    const rect = this.container.getBoundingClientRect();
    const size = Math.max(160, Math.min(rect.width, rect.height) - 24);
    this._size = size;
    this._svg.setAttribute("width", size);
    this._svg.setAttribute("height", size);
    const r = size / 2 - 28;     // leave room for cardinal labels
    this._radius = r;
    this._svg.setAttribute("viewBox", `${-size / 2} ${-size / 2} ${size} ${size}`);
    this._render();
  }

  // ---- Render -------------------------------------------------------------

  _render() {
    if (!this._svg) return;
    const hasObs = !!this.observer;
    this._empty.style.display = hasObs ? "none" : "";
    this._svg.style.display = hasObs ? "" : "none";
    if (!hasObs) return;

    const r = this._radius;
    const frag = document.createDocumentFragment();

    // ---------------- background dial ----------------
    const defs = document.createElementNS(SVG_NS, "defs");
    defs.innerHTML = `
      <radialGradient id="sky-bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#0b1736" stop-opacity="0.9"/>
        <stop offset="60%" stop-color="#06091c" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#02030e" stop-opacity="0.92"/>
      </radialGradient>
      <linearGradient id="arc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#94a3b8" stop-opacity="0.55"/>
        <stop offset="50%" stop-color="#fbbf24" stop-opacity="1"/>
        <stop offset="100%" stop-color="#94a3b8" stop-opacity="0.55"/>
      </linearGradient>
      <filter id="dot-glow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="1.6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    `;
    frag.appendChild(defs);

    const bg = document.createElementNS(SVG_NS, "circle");
    bg.setAttribute("r", r);
    bg.setAttribute("fill", "url(#sky-bg)");
    bg.setAttribute("stroke", "rgba(148,163,184,0.30)");
    bg.setAttribute("stroke-width", "1");
    frag.appendChild(bg);

    // Altitude rings at 30° and 60°
    for (const altRing of [30, 60]) {
      const rr = ((90 - altRing) / 90) * r;
      const ring = document.createElementNS(SVG_NS, "circle");
      ring.setAttribute("r", rr);
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", "rgba(148,163,184,0.18)");
      ring.setAttribute("stroke-dasharray", "2 5");
      frag.appendChild(ring);

      const lbl = document.createElementNS(SVG_NS, "text");
      lbl.setAttribute("x", "3");
      lbl.setAttribute("y", `${-rr - 3}`);
      lbl.setAttribute("class", "skyview-alt-label");
      lbl.textContent = `${altRing}°`;
      frag.appendChild(lbl);
    }

    // Radial grid every 30° azimuth
    for (let az = 0; az < 360; az += 30) {
      const a = az * DEG;
      const x = r * Math.sin(a), y = -r * Math.cos(a);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", "0"); line.setAttribute("y1", "0");
      line.setAttribute("x2", x.toFixed(2)); line.setAttribute("y2", y.toFixed(2));
      line.setAttribute("stroke", az % 90 === 0 ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.10)");
      line.setAttribute("stroke-width", "1");
      frag.appendChild(line);
    }

    // Cardinal labels (N up, E right, S down, W left)
    const cardinals = [["N", 0], ["E", 90], ["S", 180], ["W", 270]];
    for (const [label, az] of cardinals) {
      const a = az * DEG;
      const tx = (r + 18) * Math.sin(a);
      const ty = -(r + 18) * Math.cos(a);
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", tx.toFixed(2));
      t.setAttribute("y", (ty + 5).toFixed(2));
      t.setAttribute("class", `skyview-cardinal ${label === "N" ? "n" : ""}`);
      t.setAttribute("text-anchor", "middle");
      t.textContent = label;
      frag.appendChild(t);
    }

    // Zenith mark
    const zen = document.createElementNS(SVG_NS, "circle");
    zen.setAttribute("r", "3"); zen.setAttribute("fill", "rgba(148,163,184,0.40)");
    frag.appendChild(zen);

    // ---------------- pass arc (under dots) ----------------
    if (this.passArc && this.passArc.length > 1) {
      const path = document.createElementNS(SVG_NS, "path");
      const pts = [];
      for (const s of this.passArc) {
        const p = projectAltAz(s.alt, s.az, r);
        if (p) pts.push(p);
      }
      if (pts.length > 1) {
        const d = "M " + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "url(#arc-gradient)");
        path.setAttribute("stroke-width", "2.5");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("class", "skyview-arc");
        frag.appendChild(path);

        // Rise / set markers
        const riseMark = this._labeledDot(pts[0], "Rise", "#94a3b8");
        const setMark = this._labeledDot(pts[pts.length - 1], "Set", "#94a3b8");
        // Culmination = highest altitude
        let peakIdx = 0;
        for (let i = 1; i < this.passArc.length; i++) {
          if (this.passArc[i].alt > this.passArc[peakIdx].alt) peakIdx = i;
        }
        const peakP = projectAltAz(this.passArc[peakIdx].alt, this.passArc[peakIdx].az, r);
        if (peakP) {
          const peakMark = this._labeledDot(peakP, `${this.passArc[peakIdx].alt.toFixed(0)}°`, "#fbbf24", true);
          frag.appendChild(peakMark);
        }
        frag.appendChild(riseMark);
        frag.appendChild(setMark);
      }
    }

    // ---------------- live satellite dots ----------------
    const obs = this.observer;
    let aboveCount = 0;
    for (const sat of this.satellites) {
      if (sat.lat == null || sat.lon == null || sat.alt_km == null) continue;
      const { alt, az } = altAzFrom(obs.lat, obs.lon, sat.lat, sat.lon, sat.alt_km);
      const p = projectAltAz(alt, az, r);
      if (!p) continue;
      aboveCount++;

      const isSelected = sat.norad_id === this.selectedId;
      if (isSelected) {
        // Pulsing ring underneath the selected dot.
        const ring = document.createElementNS(SVG_NS, "circle");
        ring.setAttribute("cx", p.x.toFixed(2));
        ring.setAttribute("cy", p.y.toFixed(2));
        ring.setAttribute("r", 11);
        ring.setAttribute("fill", "none");
        ring.setAttribute("stroke", "#fbbf24");
        ring.setAttribute("stroke-width", "1.5");
        ring.setAttribute("class", "skyview-sel-ring");
        frag.appendChild(ring);
      }
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", p.x.toFixed(2));
      dot.setAttribute("cy", p.y.toFixed(2));
      dot.setAttribute("r", isSelected ? 6 : 3);
      dot.setAttribute("fill", isSelected ? "#fbbf24" : (sat.color || "#22d3ee"));
      dot.setAttribute("class", `skyview-dot ${isSelected ? "selected" : ""}`);
      dot.setAttribute("filter", "url(#dot-glow)");
      dot.dataset.norad = sat.norad_id;
      dot.dataset.name = sat.name;
      dot.dataset.alt = alt.toFixed(1);
      dot.dataset.az = az.toFixed(1);
      dot.addEventListener("mouseenter", (e) => this._showTooltip(e, sat, alt, az));
      dot.addEventListener("mousemove", (e) => this._moveTooltip(e));
      dot.addEventListener("mouseleave", () => this._hideTooltip());
      dot.addEventListener("click", () => this.onSelect(sat));
      frag.appendChild(dot);

      if (isSelected) {
        const label = document.createElementNS(SVG_NS, "text");
        label.setAttribute("x", (p.x + 8).toFixed(2));
        label.setAttribute("y", (p.y - 6).toFixed(2));
        label.setAttribute("class", "skyview-sel-label");
        label.textContent = sat.name;
        frag.appendChild(label);
      }
    }

    // ---------------- footer summary ----------------
    const footer = document.createElementNS(SVG_NS, "text");
    footer.setAttribute("x", "0");
    footer.setAttribute("y", `${r + 12}`);
    footer.setAttribute("class", "skyview-footer");
    footer.setAttribute("text-anchor", "middle");
    const obsTxt = `${obs.lat.toFixed(2)}°, ${obs.lon.toFixed(2)}°`;
    footer.textContent = `${aboveCount} above horizon · observer ${obsTxt}`;
    frag.appendChild(footer);

    // Replace SVG content in one pass
    while (this._svg.firstChild) this._svg.removeChild(this._svg.firstChild);
    this._svg.appendChild(frag);
  }

  _labeledDot(p, text, color, big = false) {
    const g = document.createElementNS(SVG_NS, "g");
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", p.x.toFixed(2));
    c.setAttribute("cy", p.y.toFixed(2));
    c.setAttribute("r", big ? 4.5 : 3);
    c.setAttribute("fill", color);
    c.setAttribute("class", "skyview-arc-marker");
    c.setAttribute("filter", "url(#dot-glow)");
    g.appendChild(c);
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", (p.x + 7).toFixed(2));
    t.setAttribute("y", (p.y + 4).toFixed(2));
    t.setAttribute("class", "skyview-arc-label");
    t.textContent = text;
    g.appendChild(t);
    return g;
  }

  _showTooltip(e, sat, alt, az) {
    this._tooltip.style.display = "";
    const compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(az / 45) % 8];
    this._tooltip.innerHTML = `
      <strong>${sat.name}</strong>
      <span class="skyview-tt-row">alt ${alt.toFixed(1)}° &middot; az ${az.toFixed(0)}° ${compass}</span>
    `;
    this._moveTooltip(e);
  }
  _moveTooltip(e) {
    const rect = this.container.getBoundingClientRect();
    this._tooltip.style.left = `${e.clientX - rect.left + 10}px`;
    this._tooltip.style.top = `${e.clientY - rect.top + 10}px`;
  }
  _hideTooltip() {
    this._tooltip.style.display = "none";
  }
}
