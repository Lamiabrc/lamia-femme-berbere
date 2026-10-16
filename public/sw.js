// Service worker des Confidences : affiche les notifications de Lamia, sans aucun contenu privé.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { /* */ }
  const title = d.title || 'Les Confidences';
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: d.body || 'Ouvre ton espace pour la lire.',
      tag: d.tag || 'confidences',
      renotify: true,
      icon: '/images/marque/confidences-icone-192.png',
      badge: '/images/marque/confidences-icone-192.png',
      data: { url: d.url || '/confidences-lamia/' },
    });
    if (self.navigator?.setAppBadge) self.navigator.setAppBadge().catch(() => {});
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/confidences-lamia/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) if (w.url.includes('/confidences-lamia/')) { await w.focus(); w.navigate?.(url); return; }
    await self.clients.openWindow(url);
  })());
});
