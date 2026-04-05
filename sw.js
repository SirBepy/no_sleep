const CACHE_NAME = "v1";
const ASSETS = [
  "/",
  "/index.html",
  "/src/styles/styles.css",
  "/src/scripts/script.js",
  "/src/scripts/build-info.js",
  "/assets/images/favicon.png",
  "/assets/images/favicon.svg",
  "/favicon.ico",
  "/manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request)),
  );
});
