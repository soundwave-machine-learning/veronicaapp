/*
 * Veronica service worker. Its only jobs are to make the app installable
 * and to let the app screen open when the connection is poor.
 *
 * - Business data (/api/...) is NEVER cached: it always comes from the server.
 * - Pages and files are fetched from the network first; a saved copy is used
 *   only when the network is unavailable.
 */
const CACHE = 'veronica-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request.mode === 'navigate' ? '/' : request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request.mode === 'navigate' ? '/' : request).then((cached) => cached || Response.error())),
  );
});
