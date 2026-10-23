// Keeps a copy of the app (a single HTML file) so it also opens without a connection.
// With a connection the latest version is loaded and the copy is refreshed.
const CACHE = 'show-tracks';
const APP = './';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only the app's own page; media lives in IndexedDB and never goes through here.
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(APP, copy));
        }
        return response;
      })
      .catch(() => caches.match(APP).then((cached) => cached ?? Response.error())),
  );
});
