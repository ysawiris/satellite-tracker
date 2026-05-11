// Main entry point: wires API, state, map, globe, and UI together.

import { api } from "./api.js";
import { createStore } from "./state.js";
import { MapView } from "./map.js";
import { GlobeView } from "./globe.js";
import { SkyView } from "./skyview.js";
import { loadFavorites, saveFavorites, isFavorite, toggleFavorite } from "./favorites.js";
import { GROUPS } from "./sat-data.js";

const REFRESH_MS = 30_000;
const SUN_REFRESH_MS = 5 * 60_000; // sub-solar point only crawls — no need to spam.
const WEATHER_DAYS_BACK = 6;             // 7 frames: today, -1, -2, ..., -6 days
const WEATHER_PLAY_INTERVAL_MS = 900;    // each frame on screen for ~1s
let weatherPlayTimer = null;

const store = createStore({
  view: "map", // "map" | "globe"
  visibleGroups: new Set(),
  satellitesByGroup: new Map(), // group_id -> array of sat dicts
  selected: null, // { norad_id, name, ... }
  observer: null, // { lat, lon }
  favorites: loadFavorites(),
  passes: null,
  passesLoading: false,
  passesError: null,
  visibleOnly: JSON.parse(localStorage.getItem("visibleOnly") || "false"),
});

// ---------- DOM bootstrapping ----------

// Render the layers list from the in-JS GROUPS source of truth.
(function renderGroupsList() {
  const list = document.getElementById("groups-list");
  if (!list) return;
  list.innerHTML = GROUPS.map((g) => `
    <li>
      <label class="layer-row">
        <input type="checkbox" data-group="${g.id}" ${g.default_visible ? "checked" : ""} />
        <span class="layer-dot" style="background:${g.color};color:${g.color};"></span>
        <span>${g.name}</span>
        <span class="layer-count" data-group-count="${g.id}"></span>
      </label>
    </li>
  `).join("");
})();

const groupCheckboxes = Array.from(document.querySelectorAll("[data-group]"));
const groupCounts = Object.fromEntries(
  Array.from(document.querySelectorAll("[data-group-count]")).map((el) => [el.dataset.groupCount, el])
);

groupCheckboxes.forEach((cb) => {
  if (cb.checked) store.get().visibleGroups.add(cb.dataset.group);
  cb.addEventListener("change", () => {
    const s = store.get();
    const updated = new Set(s.visibleGroups);
    if (cb.checked) updated.add(cb.dataset.group);
    else updated.delete(cb.dataset.group);
    store.set({ visibleGroups: updated });
    refreshGroup(cb.dataset.group);
  });
});

const mapView = new MapView("map-view", { onSelect: selectSatellite });
const globeView = new GlobeView("globe-view", { onSelect: selectSatellite });
const skyView = new SkyView("sky-view", { onSelect: selectSatellite });

setupViewToggle();
setupSidebarToggle();
setupSearch();
setupObserverInputs();
setupPassesRefresh();
setupFavoriteToggle();
setupLocateMe();
setupCloudsToggle();
setupVisibleOnlyToggle();
setupWeatherControls();

// ---------- Initial load ----------

(async function init() {
  setStatus("Loading satellites…");
  try {
    const visible = Array.from(store.get().visibleGroups);
    await Promise.all(visible.map(refreshGroup));
    setStatus(summarizeStatus());
    hideLoadingOverlay();
    setInterval(() => {
      const v = Array.from(store.get().visibleGroups);
      Promise.all(v.map(refreshGroup)).then(() => setStatus(summarizeStatus()));
    }, REFRESH_MS);

    // Sun + terminator heartbeat — independent of group refresh.
    refreshSun();
    setInterval(refreshSun, SUN_REFRESH_MS);
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
    hideLoadingOverlay();
  }
  renderFavorites();
})();

async function refreshSun() {
  try {
    const sun = await api.sun();
    mapView.setTerminator(sun.lat, sun.lon);
    if (globeView.viewer) globeView.setSunPosition(sun.lat, sun.lon);
  } catch (err) {
    console.warn("Sun position fetch failed", err);
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  setTimeout(() => overlay.remove(), 500);
}

// ---------- Data refresh ----------

async function refreshGroup(groupId) {
  if (!store.get().visibleGroups.has(groupId)) {
    // Group was disabled — clear it.
    const map = new Map(store.get().satellitesByGroup);
    map.delete(groupId);
    store.set({ satellitesByGroup: map });
    rerenderSatellites();
    if (groupCounts[groupId]) groupCounts[groupId].textContent = "";
    return;
  }
  try {
    const sats = await api.groupSatellites(groupId);
    const map = new Map(store.get().satellitesByGroup);
    map.set(groupId, sats);
    store.set({ satellitesByGroup: map });
    if (groupCounts[groupId]) groupCounts[groupId].textContent = sats.length;
    rerenderSatellites();
  } catch (err) {
    console.error("Failed to load group", groupId, err);
    if (groupCounts[groupId]) groupCounts[groupId].textContent = "err";
  }
}

function rerenderSatellites() {
  const all = [];
  for (const sats of store.get().satellitesByGroup.values()) all.push(...sats);

  const seenMap = mapView.upsertSatellites(all);
  mapView.removeSatellitesNotIn(seenMap);

  if (globeView.viewer) {
    const seenGlobe = globeView.upsertSatellites(all);
    globeView.removeSatellitesNotIn(seenGlobe);
  }

  skyView.setSatellites(all);

  const sel = store.get().selected;
  if (sel) {
    mapView.highlight(sel.norad_id);
    if (globeView.viewer) globeView.highlight(sel.norad_id);
    skyView.setSelected(sel.norad_id);
  }
}

// ---------- Selection ----------

function selectSatellite(sat) {
  const prev = store.get().selected;
  if (!prev || prev.norad_id !== sat.norad_id) skyView.clearPassArc();
  store.set({ selected: sat });
  document.getElementById("detail-empty").classList.add("hidden");
  document.getElementById("detail-content").classList.remove("hidden");
  document.getElementById("detail-name").textContent = sat.name;
  document.getElementById("detail-norad").textContent = sat.norad_id;
  document.getElementById("detail-lat").textContent = sat.lat.toFixed(3) + "°";
  document.getElementById("detail-lon").textContent = sat.lon.toFixed(3) + "°";
  document.getElementById("detail-alt").textContent = sat.alt_km.toFixed(1) + " km";
  document.getElementById("detail-vel").textContent = sat.velocity_kms.toFixed(2) + " km/s";

  renderSensorBadge(sat);
  renderImageryCard(sat);
  updateFavoriteButton();
  mapView.highlight(sat.norad_id);
  if (globeView.viewer) globeView.highlight(sat.norad_id);
  loadPasses(sat);
  loadOrbitTrail(sat);

  // Onboard view: hide the empty state and lock the camera onto the freshly
  // picked satellite so the user immediately sees it ride across orbit.
  if (store.get().view === "onboard") {
    document.getElementById("onboard-empty").classList.add("hidden");
    if (globeView.viewer) globeView.followSatellite(sat.norad_id);
  }
}

async function loadOrbitTrail(sat) {
  // GEO sats hardly move — a 6h sweep makes the trail visible. LEO uses 2h
  // (~1.3 orbits), enough to show the next pass without cluttering the map.
  const isGeo = sat.alt_km > 30000;
  const minutes = isGeo ? 360 : 120;
  const step = isGeo ? 120 : 30;
  try {
    const result = await api.orbit(sat.norad_id, minutes, step);
    mapView.setOrbitTrail(result.samples, sat.color);
    if (globeView.viewer) globeView.setOrbitTrail(result.samples, sat.color);
  } catch (err) {
    console.warn("Orbit trail fetch failed", err);
    mapView.clearOrbitTrail();
    if (globeView.viewer) globeView.clearOrbitTrail();
  }
}

const SENSOR_LABELS = {
  radar: { label: "All-weather radar", icon: "☁︎" },
  optical: { label: "Optical (cloud-blocked)", icon: "◉" },
  ir: { label: "Infrared (cloud-blocked)", icon: "▮" },
  comms: { label: "Comms link", icon: "≋" },
  navigation: { label: "Navigation", icon: "✚" },
  unknown: { label: "Sensor unknown", icon: "?" },
};

function renderImageryCard(sat) {
  const card = document.getElementById("detail-imagery");
  if (!card) return;
  const info = sat.imagery;
  if (!info) {
    card.classList.add("hidden");
    card.innerHTML = "";
    return;
  }
  const url = info.deep_link ? substituteDeepLink(info.url, sat) : info.url;
  const action = info.free ? "View imagery" : "Get imagery";
  const tag = info.free ? `<span class="img-tag free">FREE</span>` : `<span class="img-tag paid">PAID</span>`;
  const arrow = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>`;
  card.classList.remove("hidden");
  card.classList.toggle("is-free", !!info.free);
  card.classList.toggle("is-paid", !info.free);
  card.innerHTML = `
    <div class="img-head">
      ${tag}
      <span class="img-provider">${escapeHtml(info.provider)}</span>
    </div>
    <p class="img-desc">${escapeHtml(info.description || "")}</p>
    <a class="img-action" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
      ${action} ${arrow}
    </a>
  `;
}

function substituteDeepLink(template, sat) {
  // The observer location, if set, gives the most useful "show me imagery
  // here" framing. Otherwise centre on the satellite's current sub-point.
  const obs = store.get().observer;
  const lat = obs ? obs.lat : sat.lat;
  const lon = obs ? obs.lon : sat.lon;
  // Bounding box ~ ±20° around the point — gives Worldview / similar tools
  // a sensible regional view rather than zooming all the way in.
  const span = 20;
  const today = new Date().toISOString().slice(0, 10);
  return template
    .replaceAll("{lat}", lat.toFixed(4))
    .replaceAll("{lon}", lon.toFixed(4))
    .replaceAll("{lat_n}", (lat + span / 2).toFixed(2))
    .replaceAll("{lat_s}", (lat - span / 2).toFixed(2))
    .replaceAll("{lon_e}", (lon + span).toFixed(2))
    .replaceAll("{lon_w}", (lon - span).toFixed(2))
    .replaceAll("{date}", today);
}

function escapeAttr(s) {
  return String(s).replace(/[<>"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function renderSensorBadge(sat) {
  const wrap = document.getElementById("detail-sensor");
  const chip = document.getElementById("detail-sensor-chip");
  const note = document.getElementById("detail-sensor-note");
  if (!sat.sensor_type) {
    wrap.classList.add("hidden");
    return;
  }
  const meta = SENSOR_LABELS[sat.sensor_type] || SENSOR_LABELS.unknown;
  chip.className = `sensor-chip ${sat.sensor_type}`;
  chip.innerHTML = `<span aria-hidden="true">${meta.icon}</span>${meta.label}`;
  if (sat.all_weather) {
    note.innerHTML = `<strong>Sees through clouds.</strong> ${escapeHtml(sat.sensor_description || "")}`;
  } else if (sat.sensor_description) {
    note.textContent = sat.sensor_description;
  } else {
    note.textContent = "";
  }
  wrap.classList.remove("hidden");
}

async function loadPasses(sat) {
  const obs = store.get().observer;
  const status = document.getElementById("passes-status");
  const list = document.getElementById("passes-list");
  list.innerHTML = "";
  if (!obs) {
    status.textContent = "Set observer location to see passes.";
    return;
  }
  const visibleOnly = store.get().visibleOnly;
  status.textContent = visibleOnly ? "Computing visible passes…" : "Computing passes…";
  store.set({ passesLoading: true });
  try {
    const result = await api.passes(sat.norad_id, obs.lat, obs.lon, 5, visibleOnly);
    if (!result.passes || result.passes.length === 0) {
      status.textContent = visibleOnly
        ? "No naked-eye passes in the next 5 days."
        : "No passes above 10° in the next 5 days.";
    } else {
      const visibleCount = result.passes.filter((p) => p.visible).length;
      const noun = result.passes.length === 1 ? "pass" : "passes";
      status.innerHTML = visibleOnly
        ? `<span class="visible-pill">✦ ${visibleCount} visible ${noun}</span> in the next 5 days`
        : `${result.passes.length} ${noun} in the next 5 days · <span class="visible-pill">✦ ${visibleCount} visible</span>`;
      renderPasses(result.passes);
    }
    store.set({ passes: result.passes, passesLoading: false, passesError: null });
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    store.set({ passesError: err.message, passesLoading: false });
  }
}

function passVisibilityChip(p) {
  if (p.visible) return `<span class="vis-chip vis-yes" title="Sat is sunlit and observer is in darkness — naked-eye pass">✦ Visible</span>`;
  if (!p.sat_sunlit) return `<span class="vis-chip vis-shadow" title="Satellite is in Earth's shadow">⏾ In shadow</span>`;
  return `<span class="vis-chip vis-day" title="Sun is up at observer">☀ Daylight pass</span>`;
}

function renderPasses(passes) {
  const list = document.getElementById("passes-list");
  list.innerHTML = passes.map((p, i) => `
    <li class="pass-card ${p.visible ? "is-visible" : ""} fade-in" data-pass-idx="${i}" role="button" tabindex="0" title="Show this pass on the sky radar">
      <div class="pass-card-head">
        <div class="pass-time">${formatDateTime(p.rise_utc)}</div>
        ${passVisibilityChip(p)}
      </div>
      <div class="pass-stats">
        <div>Max alt <span class="v">${p.max_altitude_deg ?? "?"}°</span></div>
        <div>Az <span class="v">${p.azimuth_deg ?? "?"}°</span></div>
        <div>Dur <span class="v">${formatDuration(p.duration_seconds)}</span></div>
      </div>
    </li>
  `).join("");
  list.querySelectorAll(".pass-card").forEach((el) => {
    const handler = () => {
      const idx = Number(el.dataset.passIdx);
      const pass = (store.get().passes || [])[idx];
      if (pass) viewPassOnSky(pass);
    };
    el.addEventListener("click", handler);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); } });
  });
}

async function viewPassOnSky(pass) {
  const sel = store.get().selected;
  const obs = store.get().observer;
  if (!sel || !obs) return;
  // Switch to sky view first so the arc renders into something visible.
  document.querySelector('[data-view="sky"]').click();
  try {
    const result = await api.skytrack(
      sel.norad_id, obs.lat, obs.lon, pass.rise_utc, pass.set_utc, 5,
    );
    skyView.setPassArc(result.samples);
  } catch (err) {
    console.warn("Sky track fetch failed", err);
  }
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDuration(seconds) {
  if (seconds == null) return "?";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

// ---------- View toggle ----------

function setupViewToggle() {
  const buttons = document.querySelectorAll(".view-btn");
  const cloudsBtn = document.getElementById("clouds-toggle");
  function apply(view) {
    store.set({ view });
    // Onboard reuses the globe canvas — just locks the Cesium camera to a sat.
    const useGlobe = view === "globe" || view === "onboard";
    document.getElementById("map-view").classList.toggle("hidden", view !== "map");
    document.getElementById("globe-view").classList.toggle("hidden", !useGlobe);
    document.getElementById("sky-view").classList.toggle("hidden", view !== "sky");
    document.getElementById("onboard-empty").classList.toggle("hidden", view !== "onboard" || !!store.get().selected);
    buttons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === view));
    cloudsBtn.classList.toggle("hidden", view !== "globe");
    updateWeatherControlsVisibility();
    if (view === "map") {
      setTimeout(() => mapView.resize(), 50);
      // Free the camera so the next time we hit globe view it isn't still pinned.
      if (globeView.viewer) globeView.unfollowSatellite();
    } else if (view === "sky") {
      setTimeout(() => skyView.resize(), 50);
      if (globeView.viewer) globeView.unfollowSatellite();
    } else if (useGlobe) {
      globeView.init().then(() => {
        rerenderSatellites();
        const obs = store.get().observer;
        if (obs) globeView.setObserver(obs.lat, obs.lon);
        // Catch the globe up to whatever the map already has: sun, orbit, selection.
        refreshSun();
        const sel = store.get().selected;
        if (sel) loadOrbitTrail(sel);
        if (view === "onboard" && sel) {
          globeView.followSatellite(sel.norad_id);
        } else {
          globeView.unfollowSatellite();
        }
        setTimeout(() => globeView.resize(), 50);
      });
    }
  }
  buttons.forEach((b) => b.addEventListener("click", () => apply(b.dataset.view)));
  apply("map");
}

function setupCloudsToggle() {
  const btn = document.getElementById("clouds-toggle");
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(on));
    btn.style.color = on ? "var(--accent-cyan)" : "";
    if (globeView.viewer) globeView.setCloudsVisible(on);
    updateWeatherControlsVisibility();
  });
}

// ---------- Weather time scrubber ----------

function setupWeatherControls() {
  const slider = document.getElementById("weather-slider");
  const playBtn = document.getElementById("weather-play");
  const timeLabel = document.getElementById("weather-time");
  if (!slider || !playBtn) return;

  slider.max = String(WEATHER_DAYS_BACK);
  // Start at the most recent frame (slider value = WEATHER_DAYS_BACK == today-ish).
  slider.value = String(WEATHER_DAYS_BACK);

  function applyFrame() {
    const idx = Number(slider.value);
    // Slider 0 = oldest (-6 days), max = most recent (yesterday-ish, -1 day).
    const daysBack = WEATHER_DAYS_BACK - idx + 1;
    const date = new Date(Date.now() - daysBack * 24 * 3600 * 1000);
    if (globeView.viewer) globeView.setCloudTime(date);
    timeLabel.textContent = formatWeatherDate(date);
  }
  applyFrame();
  slider.addEventListener("input", () => {
    stopWeatherPlay();
    applyFrame();
  });

  playBtn.addEventListener("click", () => {
    if (weatherPlayTimer) {
      stopWeatherPlay();
    } else {
      startWeatherPlay();
    }
  });

  function startWeatherPlay() {
    setPlayBtnIcon(true);
    weatherPlayTimer = setInterval(() => {
      let v = Number(slider.value);
      v = v + 1 > Number(slider.max) ? 0 : v + 1;
      slider.value = String(v);
      applyFrame();
    }, WEATHER_PLAY_INTERVAL_MS);
  }
  function stopWeatherPlay() {
    if (weatherPlayTimer) clearInterval(weatherPlayTimer);
    weatherPlayTimer = null;
    setPlayBtnIcon(false);
  }
  function setPlayBtnIcon(playing) {
    playBtn.querySelector(".icon-play").classList.toggle("hidden", playing);
    playBtn.querySelector(".icon-pause").classList.toggle("hidden", !playing);
  }
}

function formatWeatherDate(date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function updateWeatherControlsVisibility() {
  const ctrl = document.getElementById("weather-controls");
  if (!ctrl) return;
  const cloudsBtn = document.getElementById("clouds-toggle");
  const cloudsOn = cloudsBtn.getAttribute("aria-pressed") === "true";
  const onGlobe = store.get().view === "globe";
  ctrl.classList.toggle("hidden", !(cloudsOn && onGlobe));
}

// ---------- Sidebar (mobile) ----------

function setupSidebarToggle() {
  const btn = document.getElementById("toggle-sidebar");
  const sb = document.getElementById("sidebar");
  btn.addEventListener("click", () => sb.classList.toggle("hidden"));
}

// ---------- Search ----------

function setupSearch() {
  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");
  let debounce = null;

  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 2) {
      results.classList.add("hidden");
      return;
    }
    debounce = setTimeout(async () => {
      try {
        const list = await api.search(q);
        if (list.length === 0) {
          results.innerHTML = `<div style="padding:10px 14px;font-size:12px;color:var(--text-subtle);">No matches.</div>`;
        } else {
          results.innerHTML = list.map((s) => `
            <div class="search-result" data-norad="${s.norad_id}" data-name="${escapeHtml(s.name)}">
              <span class="badge">${s.group}</span>
              <span>${escapeHtml(s.name)}</span>
              <span class="norad">#${s.norad_id ?? "?"}</span>
            </div>
          `).join("");
          results.querySelectorAll(".search-result").forEach((el) => {
            el.addEventListener("click", () => {
              const noradId = parseInt(el.dataset.norad, 10);
              selectByNoradId(noradId, el.dataset.name);
              results.classList.add("hidden");
              input.value = "";
            });
          });
        }
        results.classList.remove("hidden");
      } catch (err) {
        results.innerHTML = `<div style="padding:10px 14px;font-size:12px;color:var(--accent-rose);">Error: ${escapeHtml(err.message)}</div>`;
        results.classList.remove("hidden");
      }
    }, 250);
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.add("hidden");
    }
  });
}

async function selectByNoradId(noradId, name) {
  // Look in already-loaded sats first
  for (const sats of store.get().satellitesByGroup.values()) {
    const found = sats.find((s) => s.norad_id === noradId);
    if (found) {
      selectSatellite(found);
      mapView.panTo(found.lat, found.lon);
      if (globeView.viewer) globeView.flyTo(found.lat, found.lon, found.alt_km);
      return;
    }
  }
  // Fall back to API
  try {
    const sat = await api.satellite(noradId);
    sat.color = "#facc15";
    selectSatellite(sat);
    mapView.panTo(sat.lat, sat.lon);
    if (globeView.viewer) globeView.flyTo(sat.lat, sat.lon, sat.alt_km);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

// ---------- Observer ----------

function setupObserverInputs() {
  const lat = document.getElementById("obs-lat");
  const lon = document.getElementById("obs-lon");
  const saved = JSON.parse(localStorage.getItem("observer") || "null");
  if (saved) {
    lat.value = saved.lat;
    lon.value = saved.lon;
    setObserver(saved.lat, saved.lon);
  }
  function update() {
    const la = parseFloat(lat.value);
    const lo = parseFloat(lon.value);
    if (Number.isFinite(la) && Number.isFinite(lo)) {
      setObserver(la, lo);
    }
  }
  lat.addEventListener("change", update);
  lon.addEventListener("change", update);
}

function setObserver(lat, lon) {
  store.set({ observer: { lat, lon } });
  localStorage.setItem("observer", JSON.stringify({ lat, lon }));
  mapView.setObserver(lat, lon);
  if (globeView.viewer) globeView.setObserver(lat, lon);
  skyView.setObserver(lat, lon);
  if (store.get().selected) loadPasses(store.get().selected);
}

function setupLocateMe() {
  document.getElementById("locate-me").addEventListener("click", () => {
    if (!navigator.geolocation) {
      setStatus("Geolocation not supported.");
      return;
    }
    setStatus("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = +pos.coords.latitude.toFixed(4);
        const lon = +pos.coords.longitude.toFixed(4);
        document.getElementById("obs-lat").value = lat;
        document.getElementById("obs-lon").value = lon;
        setObserver(lat, lon);
        mapView.panTo(lat, lon);
        setStatus(summarizeStatus());
      },
      (err) => setStatus(`Location error: ${err.message}`)
    );
  });
}

// ---------- Passes refresh ----------

function setupPassesRefresh() {
  document.getElementById("passes-refresh").addEventListener("click", () => {
    const sel = store.get().selected;
    if (sel) loadPasses(sel);
  });
}

function setupVisibleOnlyToggle() {
  const toggle = document.getElementById("visible-only");
  if (!toggle) return;
  toggle.checked = store.get().visibleOnly;
  toggle.addEventListener("change", () => {
    const on = toggle.checked;
    store.set({ visibleOnly: on });
    localStorage.setItem("visibleOnly", JSON.stringify(on));
    const sel = store.get().selected;
    if (sel) loadPasses(sel);
  });
}

// ---------- Favorites ----------

function setupFavoriteToggle() {
  document.getElementById("detail-favorite").addEventListener("click", () => {
    const sel = store.get().selected;
    if (!sel) return;
    const updated = toggleFavorite(sel, store.get().favorites);
    store.set({ favorites: updated });
    saveFavorites(updated);
    updateFavoriteButton();
    renderFavorites();
  });
}

function updateFavoriteButton() {
  const sel = store.get().selected;
  const btn = document.getElementById("detail-favorite");
  if (!sel) return;
  if (isFavorite(sel.norad_id, store.get().favorites)) {
    btn.classList.add("active");
  } else {
    btn.classList.remove("active");
  }
}

function renderFavorites() {
  const list = document.getElementById("favorites-list");
  const favs = store.get().favorites;
  if (favs.length === 0) {
    list.innerHTML = `<li class="fav-empty">No favorites yet — star a satellite to save it.</li>`;
    return;
  }
  list.innerHTML = favs.map((f) => `
    <li>
      <button data-norad="${f.norad_id}" class="fav-row">
        <span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.name)}</span>
        <span class="norad">#${f.norad_id}</span>
      </button>
    </li>
  `).join("");
  list.querySelectorAll("button[data-norad]").forEach((b) => {
    b.addEventListener("click", () => selectByNoradId(parseInt(b.dataset.norad, 10), b.textContent.trim()));
  });
}

// ---------- Status & helpers ----------

function setStatus(text) {
  const el = document.getElementById("status-text");
  if (el) el.textContent = text;
}

function summarizeStatus() {
  let total = 0;
  for (const sats of store.get().satellitesByGroup.values()) total += sats.length;
  return `${total} satellites · live updates every ${REFRESH_MS / 1000}s`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// ---------- PWA ----------

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("static/js/sw.js").catch(() => {});
}
