import { test, expect } from '@playwright/test';
import { authenticate } from './helpers.ts';
import type { Database } from '../../src/lib/model.ts';

test('profile addresses open Maps, stay searchable and survive edits and JSON restore', async ({
  page
}, info) => {
  await authenticate(page);
  await page.goto('/personen');
  await page.getByRole('button', { name: 'Person hinzufügen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(`Adresse ${info.project.name}`);
  await dialog.getByLabel('Straße', { exact: true }).fill('Mühlenstraße');
  await dialog.getByLabel('Hausnummer', { exact: true }).fill('12 a');
  await dialog.getByLabel('PLZ', { exact: true }).fill('01219');
  await dialog.getByLabel('Ort', { exact: true }).fill('Dresden');
  await dialog.getByRole('button', { name: 'Person anlegen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const profile = page.url();
  const link = page.getByRole('link', {
    name: 'Adresse in Google Maps öffnen: Mühlenstraße 12 a, 01219 Dresden',
    exact: true
  });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const href = new URL((await link.getAttribute('href'))!);
  expect(href.origin + href.pathname).toBe('https://www.google.com/maps/search/');
  expect(href.searchParams.get('query')).toBe('Mühlenstraße 12 a, 01219 Dresden');
  expect(href.searchParams.get('api')).toBe('1');
  // Verify the click opens the address without sending test data to Google.
  await page
    .context()
    .route('https://www.google.com/maps/**', (route) => route.fulfill({ body: 'Maps test' }));
  const opened = page.waitForEvent('popup');
  await link.click();
  const popup = await opened;
  await popup.waitForLoadState();
  expect(new URL(popup.url()).searchParams.get('query')).toBe('Mühlenstraße 12 a, 01219 Dresden');
  await popup.close();
  await expect(page).toHaveURL(profile);

  await page.getByRole('button', { name: 'Profil bearbeiten', exact: true }).click();
  await expect(dialog.getByLabel('PLZ', { exact: true })).toHaveValue('01219');
  await dialog.getByLabel('Kontext', { exact: true }).fill('Mit vollständiger Adresse');
  await page.screenshot({ path: info.outputPath('address-form.png') });
  await dialog.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(link).toBeVisible();
  const exported = (await (await page.request.get('/export?format=json')).json()) as Database;
  const person = exported.people.find((person) => person.id === profile.split('/').at(-1))!;
  expect(person).toMatchObject({
    street: 'Mühlenstraße',
    houseNumber: '12 a',
    postalCode: '01219',
    location: 'Dresden'
  });

  for (const search of ['Mühlenstraße', '01219']) {
    await page.goto('/personen');
    await page.getByLabel('Personen durchsuchen').fill(search);
    await expect(
      page
        .getByRole('link')
        .filter({ has: page.getByRole('heading', { name: person.name, exact: true }) })
    ).toBeVisible();
    await page.goto('/');
    await page.getByLabel('Person suchen', { exact: true }).fill(search);
    await expect(
      page.locator('.search-results').getByRole('link').filter({ hasText: person.name })
    ).toBeVisible();
  }
  await page.goto(profile);
  await page.getByRole('button', { name: 'Profil bearbeiten', exact: true }).click();
  for (const label of ['Straße', 'Hausnummer', 'PLZ', 'Ort'])
    await dialog.getByLabel(label, { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.profile-address')).toHaveCount(0);
  await page.goto('/einstellungen');
  await page.getByText('Daten wiederherstellen', { exact: true }).click();
  await page.getByLabel('Sicherungsdatei', { exact: true }).setInputFiles({
    name: 'addresses.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported))
  });
  await page.getByLabel('Ich möchte den aktuellen Datenbestand ersetzen.').check();
  await page.getByRole('button', { name: 'Prüfen und importieren', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Daten importiert');
  await page.goto(profile);
  await expect(link).toBeVisible();
  await page.screenshot({ path: info.outputPath('address-profile-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Dunkelmodus aktivieren' }).click();
  await expect(link).toBeVisible();
  await page.screenshot({ path: info.outputPath('address-profile-dark.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
