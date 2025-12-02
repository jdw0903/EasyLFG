// sw.js
const CACHE_NAME = "easylfg-static-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/logo-easylfg.svg",
  "/manifest.json"
];

// Install: cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// Activate: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
});

// Fetch: cache-first for static, network-first for API posts
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls: let the page handle offline logic
  if (url.pathname.startsWith("/posts")) {
    return;
  }

  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => cached);
    })
  );
});
