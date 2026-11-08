const CACHE_NAME = "v2";
// Relative to the worker's own URL so they resolve under GitHub Pages' /no_sleep/ subpath;
// root-absolute paths 404 there, which makes cache.addAll reject and the install fail.
const ASSETS = [
  "./",
  "./index.html",
  "./src/styles/styles.css",
  "./src/scripts/script.js",
  "./src/scripts/sessions.js",
  "./src/scripts/history.js",
  "./src/scripts/store.js",
  "./src/scripts/firebase-config.js",
  "./src/scripts/build-info.js",
  "./assets/images/favicon.png",
  "./assets/images/favicon.svg",
  "./favicon.ico",
  "./manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Network first so a deploy reaches users immediately; the cache only covers being offline.
// Cross-origin requests (Firebase SDK, styleguide CDN) are left to the browser.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Only good responses are cached, so a 404 or 5xx is never replayed offline later.
        if (response.ok) {
          const copy = response.clone();
          // waitUntil keeps the worker alive until the write lands.
          e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy)));
        }
        return response;
      })
      // respondWith(undefined) fails the request obscurely; a cache miss becomes a clean network error.
      .catch(() => caches.match(e.request).then((cached) => cached || Response.error())),
  );
});
