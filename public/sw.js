// Service worker de la Maison : application installable (page hors ligne) et notifications.
// Il ne met jamais en cache les données, les paiements ni les espaces privés : tout passe par le réseau.
const HORS_LIGNE = '/hors-ligne/';
const CACHE = 'maison-v7';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([HORS_LIGNE, '/images/marque/lfb-icone-192.png'])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const r = event.request;
  if (r.mode !== 'navigate' || r.method !== 'GET') return;
  event.respondWith(fetch(r).catch(async () => (await caches.match(HORS_LIGNE)) || Response.error()));
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { /* */ }
  const title = d.title || 'Les Confidences';
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: d.body || 'Ouvre ton espace pour la lire.',
      tag: d.tag || 'confidences',
      renotify: true,
      icon: d.icon || '/images/marque/notif-lfb-2.png',
      badge: '/images/marque/badge-lfb.png',
      data: { url: d.url || '/confidences-lamia/' },
      // Boutons sous la notification (Android) : ils ouvrent la même adresse que la notification.
      ...(Array.isArray(d.actions) ? { actions: d.actions.slice(0, 2) } : {}),
    });
    if (self.navigator?.setAppBadge) self.navigator.setAppBadge().catch(() => {});
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/confidences-lamia/', self.location.origin).href;
  event.waitUntil((async () => {
    // Adresse hors du site (Google Play) : ouverte directement, sans toucher aux onglets du site.
    if (new URL(url).origin !== self.location.origin) { await self.clients.openWindow(url); return; }
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const coin = new URL(url).pathname.startsWith('/confidences-lamia/') ? '/confidences-lamia/' : '/';
    for (const w of wins) if (new URL(w.url).pathname.startsWith(coin)) { await w.focus(); try { await w.navigate(url); return; } catch { break; } }
    await self.clients.openWindow(url);
  })());
});
