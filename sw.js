const CACHE_NAME = "kisanai-v1";
const ASSETS = [
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "icon.svg"
];

// Install Event - Caches Core Assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Pre-caching offline safe assets...");
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean Up Stale Cache
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Removing stale cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Cache-First fallback with network-first for pages
self.addEventListener("fetch", (event) => {
  // Direct ignore for chrome-extensions or POST APIs
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        
        // Dynamically cache new fetches
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return networkResponse;
      }).catch((err) => {
        console.warn("[Service Worker] Network request failed. Device offline:", err);
        // Page fallback if page navigation fails
        if (event.request.mode === "navigate") {
          return caches.match("index.html");
        }
      });
    })
  );
});
