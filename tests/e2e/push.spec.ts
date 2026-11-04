import { test, expect, type Page } from '@playwright/test';
import { createECDH, randomBytes } from 'node:crypto';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Dein Passwort').fill('nahbei-browser-tests-only');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/einstellungen');
}
test('connect, test and disconnect a browser device without leaking subscription secrets', async ({
  page
}, info) => {
  const curve = createECDH('prime256v1');
  curve.generateKeys();
  const subscription = {
    endpoint: `https://fcm.googleapis.com/fcm/send/test-${info.project.name}`,
    expirationTime: null,
    keys: {
      p256dh: curve.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url')
    }
  };
  // Only the browser permission/provider handshake is simulated. Service-worker
  // installation, authenticated app API, persistence and UI run normally.
  await page.addInitScript((sub) => {
    let permission: NotificationPermission = 'default';
    let current: PushSubscription | null = null;
    Object.defineProperty(Notification, 'permission', { get: () => permission });
    Notification.requestPermission = async () => {
      permission = 'granted';
      return permission;
    };
    PushManager.prototype.getSubscription = async () => current;
    PushManager.prototype.subscribe = async (options) => {
      current = {
        endpoint: sub.endpoint,
        expirationTime: null,
        options: { applicationServerKey: options?.applicationServerKey, userVisibleOnly: true },
        toJSON: () => sub,
        unsubscribe: async () => {
          current = null;
          return true;
        }
      } as unknown as PushSubscription;
      return current;
    };
  }, subscription);
  await login(page);
  await expect(page.getByRole('button', { name: 'Auf diesem Gerät aktivieren' })).toBeEnabled();
  await page.getByLabel('Gerätename').fill(`Testgerät ${info.project.name}`);
  await page.getByRole('button', { name: 'Auf diesem Gerät aktivieren' }).click();
  await expect(page.getByText('Auf diesem Gerät aktiv', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Testnachricht senden' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Testnachricht an den Push-Dienst übergeben'
  );
  await expect(page.getByText('An Push-Dienst übergeben', { exact: true }).first()).toBeVisible();
  const exported = await (await page.request.get('/export?format=json')).text();
  expect(exported).not.toContain(subscription.endpoint);
  expect(exported).not.toContain(subscription.keys.auth);
  const html = await (await page.request.get('/einstellungen')).text();
  expect(html).not.toContain(subscription.endpoint);
  expect(html).not.toContain(subscription.keys.auth);
  expect(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistration('/'))?.active?.scriptURL
    )
  ).toContain('/service-worker.js');
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: info.outputPath('push-settings.png'), fullPage: true });
  await page.getByRole('button', { name: 'Auf diesem Gerät deaktivieren' }).click();
  await expect(page.getByRole('button', { name: 'Auf diesem Gerät aktivieren' })).toBeVisible();
  await expect(page.getByText(`Testgerät ${info.project.name}`, { exact: true })).toHaveCount(0);
});
test('blocked notifications and iPhone home-screen setup have actionable instructions', async ({
  page
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(Notification, 'permission', { get: () => 'denied' })
  );
  await login(page);
  await expect(page.getByRole('button', { name: 'Auf diesem Gerät aktivieren' })).toBeDisabled();
  await expect(page.getByText(/Benachrichtigungen sind für totally! blockiert/)).toBeVisible();
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'userAgent', {
      get: () =>
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'
    })
  );
  await page.reload();
  await expect(page.getByText(/Zum Home-Bildschirm/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Auf diesem Gerät aktivieren' })).toHaveCount(0);
});
test('PWA assets are public while push operations require a session and same origin', async ({
  page,
  request
}) => {
  expect((await request.get('/manifest.webmanifest')).status()).toBe(200);
  expect((await request.get('/icons/apple-touch-icon.png')).headers()['content-type']).toContain(
    'image/png'
  );
  const worker = await request.get('/service-worker.js');
  expect(worker.status()).toBe(200);
  expect(await worker.text()).toContain('showNotification');
  const unauthorized = await request.post('/api/push', {
    headers: { origin: 'http://127.0.0.1:4173' },
    data: { operation: 'status', endpoint: 'test' }
  });
  expect(unauthorized.status()).toBe(401);
  await login(page);
  const crossSite = await page.request.post('/api/push', {
    headers: { origin: 'https://attacker.example' },
    data: { operation: 'test', id: 'any' }
  });
  expect(crossSite.status()).toBe(403);
});
