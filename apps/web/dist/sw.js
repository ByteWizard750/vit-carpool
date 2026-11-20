// VIT Carpool Service Worker for Web Push Notifications (Milestone 7)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'VIT Carpool';
    const options = {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { url: data.url || '/' },
      tag: data.tag || 'vit-carpool-alert',
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (_err) {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('VIT Carpool', {
        body: text,
        icon: '/icon-192.png',
      }),
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    }),
  );
});

