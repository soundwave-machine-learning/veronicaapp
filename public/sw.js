/*
 * Veronica service worker. Its only jobs are to make the app installable
 * and to let the app screen open when the connection is poor.
 *
 * Updates always reach people:
 * - Pages and files are fetched from the network FIRST. A saved copy is used
 *   only when the network is unavailable, so a new deployment shows up on the
 *   next load. Nobody gets stuck on an old version.
 * - This file is served with "Cache-Control: no-cache", so browsers check
 *   for a new service worker on every visit, and a new one takes over at once.
 * - Business data (/api/...) is NEVER cached. It always comes from the server.
 *
 * Emergency switch: if this worker ever misbehaves, replace this file with one
 * that calls self.registration.unregister() and deploy.
 */
const CACHE = 'veronica-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Keep only the files the newest page uses, so old versions don't pile up. */
async function keepOnlyCurrentAssets(html) {
  const current = new Set(Array.from(html.matchAll(/\/assets\/[^"'\s)]+/g), (match) => match[0]));
  if (!current.size) return;
  const cache = await caches.open(CACHE);
  for (const request of await cache.keys()) {
    const { pathname } = new URL(request.url);
    // Fonts are referenced from the stylesheet, not the page, so keep them.
    if (pathname.startsWith('/assets/') && !current.has(pathname) && !/\.(woff2?|ttf)$/.test(pathname)) {
      await cache.delete(request);
    }
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const isPage = request.mode === 'navigate';
  const key = isPage ? '/' : request;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then(async (cache) => {
              await cache.put(key, copy.clone());
              if (isPage) await keepOnlyCurrentAssets(await copy.text());
            }),
          );
        }
        return response;
      })
      .catch(() => caches.match(key).then((cached) => cached || Response.error())),
  );
});
