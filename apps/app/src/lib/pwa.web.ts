export function registerPwa() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (__DEV__ || local) {
    // Update old registrations so the dev server's retirement worker can also
    // reload other open tabs. Never clear localStorage: it holds task identity.
    navigator.serviceWorker.getRegistrations().then(async registrations => {
      for (const registration of registrations) {
        await registration.update().catch(() => {
          // A Metro-only server may not expose the old worker script.
        });
        await registration.unregister();
      }
    }).catch(error => console.warn('Could not retire local PWA worker', error));
    return;
  }
  navigator.serviceWorker.register('/sw.js')
    .catch(error => console.warn('Offline app shell unavailable', error));
}
