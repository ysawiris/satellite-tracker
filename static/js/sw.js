// Service worker — caches the app shell for offline use, network-first for
// data/* (TLE files) so fresh refreshes from the GitHub Action are picked up.
//
// All paths are scope-relative so the SW works whether Pages serves us at the
// site root or at a project sub-path like /satellite-tracker/.

const CACHE = "satellite-tracker-v2";
const SHELL = [
  "./",
  "./index.html",
  "./static/css/app.css",
  "./static/js/app.js",
  "./static/js/api.js",
  "./static/js/state.js",
  "./static/js/map.js",
  "./static/js/globe.js",
  "./static/js/skyview.js",
  "./static/js/favorites.js",
  "./static/js/sat-data.js",
  "./static/js/sat-core.js",
  "./static/js/sun-math.js",
  "./static/js/passes.js",
  "./static/js/tle-store.js",
  "./static/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // TLE data: network-first so a new GitHub Action commit is picked up
  // immediately instead of being cached stale for the next session.
  if (url.pathname.includes("/data/")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          if (resp.ok && url.origin === self.location.origin) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
