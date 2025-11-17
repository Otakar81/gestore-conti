const CACHE_NAME = "gestore-conti-cache-v5";
const URLS_TO_CACHE = [
  "./",
  "index.html",
  "dashboard_successione.html",
  "dashboard_immobili.html",
  "dashboard_completa.html",

  // assets
  "manifest.json",
  "favicon.png",
  "icon-192.png",
  "icon-512.png",

  // css
  "css/common.css",
  "css/tema_completa.css",
  "css/tema_immobili.css",
  "css/tema_successione.css",

  // js  
  "js/dashboard.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }))
    )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
