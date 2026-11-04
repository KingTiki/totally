import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import type { Database } from '../../src/lib/model.ts';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Dein Passwort').fill('nahbei-browser-tests-only');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Demnächst.' })).toBeVisible();
}

test('profile photo can be added, preserved, exported, restored and removed', async ({
  page,
  request
}, info) => {
  await login(page);
  await page.goto('/personen');
  await page.getByRole('button', { name: 'Person hinzufügen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const name = `Foto ${info.project.name}`;
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog
    .getByLabel('Profilfoto auswählen', { exact: true })
    .setInputFiles(fileURLToPath(new URL('../fixtures/profile.jpg', import.meta.url)));
  await dialog.getByRole('button', { name: 'Ausschnitt übernehmen', exact: true }).click();
  await expect(dialog.locator('.photo-preview img')).toBeVisible();
  await dialog.getByRole('button', { name: 'Person anlegen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const profileUrl = page.url();
  const id = profileUrl.split('/').at(-1)!;
  const image = page.locator('.profile-avatar img');
  await expect(image).toBeVisible();
  await image.evaluate((img: HTMLImageElement) => img.decode());
  expect(
    await image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 384)
  ).toBe(true);
  const exported = (await (await page.request.get('/export?format=json')).json()) as Database;
  const photoId = exported.people.find((p) => p.id === id)!.photoId!;
  expect(photoId).toMatch(/^[a-f0-9]{64}$/);
  expect(exported.people.find((p) => p.id === id)!.photo).toBeUndefined();
  const photo = `/photos/${photoId}`;
  const backup = await (await page.request.get('/export')).body();
  const photoResponse = await page.request.get(photo);
  expect(photoResponse.headers()['content-type']).toBe('image/jpeg');
  expect(photoResponse.headers()['cache-control']).toBe('private, no-cache');
  expect(
    (
      await page.request.get(photo, { headers: { 'if-none-match': photoResponse.headers().etag } })
    ).status()
  ).toBe(304);
  expect((await request.get(photo, { maxRedirects: 0 })).status()).toBe(401);
  expect(
    (
      await request.get(photo, {
        headers: { 'if-none-match': photoResponse.headers().etag },
        maxRedirects: 0
      })
    ).status()
  ).toBe(401);
  await page.getByRole('button', { name: 'Profil bearbeiten', exact: true }).click();
  await dialog.getByLabel('Kontext', { exact: true }).fill('Mit eigenem Foto');
  await dialog.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(image).toHaveAttribute('src', photo);
  await page.screenshot({
    path: info.outputPath('photo-profile-light.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.goto('/personen');
  await page.getByLabel('Personen durchsuchen').fill(name);
  await expect(page.locator('.person-row img')).toHaveAttribute('src', photo);
  await page.getByRole('button', { name: 'Dunkelmodus aktivieren' }).click();
  await page.screenshot({
    path: info.outputPath('photo-list-dark.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.goto(profileUrl);
  await page.getByRole('button', { name: 'Profil bearbeiten', exact: true }).click();
  await dialog.getByLabel('Profilfoto auswählen', { exact: true }).setInputFiles({
    name: 'unsafe.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg></svg>')
  });
  await expect(dialog.getByRole('alert')).toContainText('JPG, PNG oder WebP');
  await expect(dialog.locator('.photo-preview img')).toHaveAttribute('src', photo);
  await dialog.getByRole('button', { name: 'Foto entfernen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(image).toHaveCount(0);
  const stillReferenced = (
    (await (await page.request.get('/export?format=json')).json()) as Database
  ).people.some((person) => person.photoId === photoId);
  expect((await page.request.get(photo)).status()).toBe(stillReferenced ? 200 : 404);
  await expect(page.locator('.profile-avatar')).toHaveText(
    `F${info.project.name[0].toUpperCase()}`
  );
  await page.goto('/einstellungen');
  await page.getByText('Daten wiederherstellen', { exact: true }).click();
  await page.getByLabel('Sicherungsdatei', { exact: true }).setInputFiles({
    name: 'photos.zip',
    mimeType: 'application/zip',
    buffer: backup
  });
  await page.getByLabel('Ich möchte den aktuellen Datenbestand ersetzen.').check();
  await page.getByRole('button', { name: 'Prüfen und importieren' }).click();
  await expect(page.getByRole('status')).toContainText('Daten importiert');
  await page.goto(profileUrl);
  await expect(image).toHaveAttribute('src', photo);
  expect((await page.request.get(photo)).status()).toBe(200);
  await page.screenshot({
    path: info.outputPath('photo-profile-dark.png'),
    fullPage: true,
    animations: 'disabled'
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/einstellungen');
    await expect(
      page.getByRole('link', { name: 'ZIP-Sicherung herunterladen', exact: true })
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({ path: info.outputPath('backup-settings-320.png'), fullPage: true });
  }
});

test('explicit themes persist across reloads while system mode follows device changes', async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await login(page);
  await page.goto('/einstellungen');
  const group = page.getByRole('group', { name: 'Farbschema' });
  await expect(group.getByRole('radio', { name: 'Wie das Gerät' })).toBeChecked();
  await group.getByRole('radio', { name: 'Hell', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(group.getByRole('radio', { name: 'Hell', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Dunkelmodus aktivieren' }).click();
  await expect(group.getByRole('radio', { name: 'Dunkel', exact: true })).toBeChecked();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: info.outputPath('settings-dark.png'),
    fullPage: true,
    animations: 'disabled'
  });
  for (const path of ['/', '/personen', '/kalender']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
    ).toBe('rgb(20, 25, 22)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({
      path: info.outputPath(`${path.slice(1) || 'overview'}-dark.png`),
      fullPage: true,
      animations: 'disabled'
    });
  }
  await page.goto('/einstellungen');
  await group.getByRole('radio', { name: 'Wie das Gerät' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(group.getByRole('radio', { name: 'Wie das Gerät' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Hellmodus aktivieren' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(errors).toEqual([]);
});
