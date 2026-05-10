// Main entry point: wires API, state, map, globe, and UI together.

import { api } from "./api.js";
import { createStore } from "./state.js";
import { MapView } from "./map.js";
import { GlobeView } from "./globe.js";
import { loadFavorites, saveFavorites, isFavorite, toggleFavorite } from "./favorites.js";

const REFRESH_MS = 30_000;

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
});

// ---------- DOM bootstrapping ----------

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

setupViewToggle();
setupThemeToggle();
setupSidebarToggle();
setupSearch();
setupObserverInputs();
setupPassesRefresh();
setupFavoriteToggle();
setupLocateMe();

// ---------- Initial load ----------

(async function init() {
  setStatus("Loading satellites…");
  try {
    const visible = Array.from(store.get().visibleGroups);
    await Promise.all(visible.map(refreshGroup));
    setStatus(summarizeStatus());
    setInterval(() => {
      const v = Array.from(store.get().visibleGroups);
      Promise.all(v.map(refreshGroup)).then(() => setStatus(summarizeStatus()));
    }, REFRESH_MS);
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
  }
  renderFavorites();
})();

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

  const sel = store.get().selected;
  if (sel) {
    mapView.highlight(sel.norad_id);
    if (globeView.viewer) globeView.highlight(sel.norad_id);
  }
}

// ---------- Selection ----------

function selectSatellite(sat) {
  store.set({ selected: sat });
  document.getElementById("detail-empty").classList.add("hidden");
  document.getElementById("detail-content").classList.remove("hidden");
  document.getElementById("detail-name").textContent = sat.name;
  document.getElementById("detail-norad").textContent = sat.norad_id;
  document.getElementById("detail-lat").textContent = sat.lat.toFixed(3) + "°";
  document.getElementById("detail-lon").textContent = sat.lon.toFixed(3) + "°";
  document.getElementById("detail-alt").textContent = sat.alt_km.toFixed(1) + " km";
  document.getElementById("detail-vel").textContent = sat.velocity_kms.toFixed(2) + " km/s";

  updateFavoriteButton();
  mapView.highlight(sat.norad_id);
  if (globeView.viewer) globeView.highlight(sat.norad_id);
  loadPasses(sat);
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
  status.textContent = "Computing passes…";
  store.set({ passesLoading: true });
  try {
    const result = await api.passes(sat.norad_id, obs.lat, obs.lon, 5);
    if (!result.passes || result.passes.length === 0) {
      status.textContent = "No passes above 10° in the next 5 days.";
    } else {
      status.textContent = `${result.passes.length} pass${result.passes.length === 1 ? "" : "es"} in the next 5 days`;
      renderPasses(result.passes);
    }
    store.set({ passes: result.passes, passesLoading: false, passesError: null });
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    store.set({ passesError: err.message, passesLoading: false });
  }
}

function renderPasses(passes) {
  const list = document.getElementById("passes-list");
  list.innerHTML = passes.map((p) => `
    <li class="rounded border border-slate-200 p-2 dark:border-slate-700">
      <div class="font-medium">${formatDateTime(p.rise_utc)}</div>
      <div class="mt-1 grid grid-cols-3 gap-2 text-slate-500">
        <div>Max alt: <span class="font-mono">${p.max_altitude_deg ?? "?"}°</span></div>
        <div>Az: <span class="font-mono">${p.azimuth_deg ?? "?"}°</span></div>
        <div>Duration: <span class="font-mono">${formatDuration(p.duration_seconds)}</span></div>
      </div>
    </li>
  `).join("");
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
  function apply(view) {
    store.set({ view });
    document.getElementById("map-view").classList.toggle("hidden", view !== "map");
    document.getElementById("globe-view").classList.toggle("hidden", view !== "globe");
    buttons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === view));
    if (view === "map") {
      setTimeout(() => mapView.resize(), 50);
    } else {
      globeView.init().then(() => {
        rerenderSatellites();
        const obs = store.get().observer;
        if (obs) globeView.setObserver(obs.lat, obs.lon);
        setTimeout(() => globeView.resize(), 50);
      });
    }
  }
  buttons.forEach((b) => b.addEventListener("click", () => apply(b.dataset.view)));
  apply("map");
}

// ---------- Theme ----------

function setupThemeToggle() {
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const html = document.documentElement;
    const next = html.classList.contains("dark") ? "light" : "dark";
    html.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  });
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
          results.innerHTML = `<div class="px-3 py-2 text-xs text-slate-400">No matches.</div>`;
        } else {
          results.innerHTML = list.map((s) => `
            <div class="search-result" data-norad="${s.norad_id}" data-name="${escapeHtml(s.name)}">
              <span class="badge">${s.group}</span>
              <span>${escapeHtml(s.name)}</span>
              <span class="ml-auto text-xs text-slate-400">#${s.norad_id ?? "?"}</span>
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
        results.innerHTML = `<div class="px-3 py-2 text-xs text-red-500">Error: ${escapeHtml(err.message)}</div>`;
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
  const svg = btn.querySelector("svg");
  if (isFavorite(sel.norad_id, store.get().favorites)) {
    svg.classList.add("favorite-active");
  } else {
    svg.classList.remove("favorite-active");
  }
}

function renderFavorites() {
  const list = document.getElementById("favorites-list");
  const favs = store.get().favorites;
  if (favs.length === 0) {
    list.innerHTML = `<li class="px-2 py-1 text-xs italic text-slate-400">No favorites yet — star a satellite to save it.</li>`;
    return;
  }
  list.innerHTML = favs.map((f) => `
    <li>
      <button data-norad="${f.norad_id}" class="flex w-full items-center justify-between rounded px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
        <span class="truncate">${escapeHtml(f.name)}</span>
        <span class="text-xs text-slate-400">#${f.norad_id}</span>
      </button>
    </li>
  `).join("");
  list.querySelectorAll("button[data-norad]").forEach((b) => {
    b.addEventListener("click", () => selectByNoradId(parseInt(b.dataset.norad, 10), b.textContent.trim()));
  });
}

// ---------- Status & helpers ----------

function setStatus(text) {
  document.getElementById("status").textContent = text;
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
  navigator.serviceWorker.register("/static/js/sw.js").catch(() => {});
}
