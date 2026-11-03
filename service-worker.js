// Incrementare la versione a ogni rilascio del codice del sito.
const CACHE_PREFIX = `gestore-conti-cache:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}v21-pulsanti-mobile`;
const URLS_TO_CACHE = [
    "./", "index.html", "dashboard_successione.html", "dashboard_immobili.html", "dashboard_completa.html",
    "manifest.json", "favicon.png", "icon-192.png", "icon-512.png",
    "css/common.css",
    "js/dati.js", "js/dashboard.js", "js/home.js", "js/pwa.js"
];
const ASSET_URLS = new Set(URLS_TO_CACHE.map(path => new URL(path, self.registration.scope).href));

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll([...ASSET_URLS].map(url => new Request(url, { cache: "reload" })));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const obsolete = [];
        for (const key of await caches.keys()) {
            if (key === CACHE_NAME) continue;
            if (key.startsWith(CACHE_PREFIX)) {
                obsolete.push(key);
            } else if (/^gestore-conti-cache-v\d+$/.test(key)) {
                // Rimuovere la cache storica solo se appartiene allo stesso percorso del sito.
                const cache = await caches.open(key);
                if ((await cache.keys()).some(request => ASSET_URLS.has(request.url))) obsolete.push(key);
            }
        }
        await Promise.all(obsolete.map(key => caches.delete(key)));
        await self.clients.claim();
        if (obsolete.length) {
            // Le vecchie pagine non avevano un listener per il cambio di service worker.
            const windows = await self.clients.matchAll({ type: "window" });
            await Promise.all(windows.filter(client => client.url.startsWith(self.registration.scope))
                .map(client => client.navigate(client.url).catch(() => {})));
        }
    })());
});

self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);
    url.search = "";
    // Solo il codice del sito ha un fallback offline: niente Sheets, JSON storici o CDN.
    if (event.request.method !== "GET" || !ASSET_URLS.has(url.href)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            const response = await fetch(event.request, { cache: "no-cache" });
            // Una cache piena non deve nascondere una risposta di rete aggiornata.
            if (response.ok) await cache.put(url.href, response.clone()).catch(() => {});
            return response;
        } catch (error) {
            const cached = await cache.match(url.href);
            if (cached) return cached;
            throw error;
        }
    })());
});
