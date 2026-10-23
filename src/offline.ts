/**
 * Registers the service worker that keeps a copy of the app for use without a
 * connection, and calls `onReady` once that copy is stored. Only in the built
 * app: on the dev server a cached copy would hide code changes.
 */
export function enableOffline(onReady: () => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('./sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => caches.match('./'))
    .then((cached) => {
      if (cached) onReady();
    })
    .catch(() => {
      // Without the copy the app still works online.
    });
}
