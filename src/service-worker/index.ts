import { notificationPayload, safeNotificationUrl } from '../lib/push-payload.ts';
const sw = self as unknown as ServiceWorkerGlobalScope;

// Deliberately no fetch/cache handler: private profiles and API responses stay online-only.
sw.addEventListener('install', (event) => {
  event.waitUntil(sw.skipWaiting());
});
sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim());
});
sw.addEventListener('push', (event) => {
  let data: unknown;
  try {
    data = event.data?.json();
  } catch {
    data = undefined;
  }
  const payload = notificationPayload(data);
  event.waitUntil(
    sw.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icons/pwa-192.png',
      badge: '/icons/pwa-192.png',
      data: { url: safeNotificationUrl(payload.url, sw.location.origin) }
    })
  );
});
sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safeNotificationUrl(event.notification.data?.url, sw.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === sw.location.origin);
      if (existing) {
        await existing.navigate(target);
        await existing.focus();
      } else await sw.clients.openWindow(target);
    })()
  );
});
