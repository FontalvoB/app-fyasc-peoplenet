/*
 * Handlers nativos del service worker de PeopleNet.
 *
 * Workbox (generateSW) genera el SW principal y este archivo se importa con
 * `workbox.importScripts`. Aquí vive solo lo que Workbox no cubre:
 * - notificationclick: enfocar la app instalada y abrir la ruta correcta.
 * - push: soporte listo para cuando el backend envíe Web Push (VAPID).
 *
 * No se cachea nada aquí: el precache y el fallback de navegación siguen
 * siendo responsabilidad exclusiva de Workbox.
 */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const path = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/dashboard/notifications';
  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const sameOrigin = clients.filter((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });

        if (sameOrigin.length > 0) {
          const client = sameOrigin[0];
          return client
            .navigate(targetUrl)
            .catch(() => undefined)
            .then(() => client.focus())
            .catch(() => undefined);
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: 'PeopleNet', body: event.data.text() };
    }
  }

  const title = payload.title || 'PeopleNet';
  const options = {
    body: payload.body || 'Tienes una novedad en tu espacio.',
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-192x192.png',
    tag: payload.tag || 'peoplenet-push',
    data: { url: payload.url || '/dashboard/notifications' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
