// Replaces any PWA worker installed by an earlier localhost production preview.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('workbox-precache-')) await caches.delete(key);
    }
    await self.registration.unregister();
    // Reload old controlled pages once so they receive the live development app.
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      await client.navigate(client.url);
    }
  })());
});
