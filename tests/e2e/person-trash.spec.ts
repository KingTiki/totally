import { test, expect, type Page } from '@playwright/test';
import { authenticate } from './helpers.ts';
import { fixture, person } from '../helpers.ts';
import { localClock } from '../../src/lib/dates.ts';
import type { Database } from '../../src/lib/model.ts';

const exported = async (page: Page) =>
  (await (await page.request.get('/export?format=json')).json()) as Database;
async function seed(page: Page) {
  await authenticate(page);
  const db = fixture();
  db.people.push({ ...person('alex'), name: 'Alex', tags: ['Arbeit'] });
  db.people[0].tags = ['Nur Lea'];
  const today = localClock(new Date(), db.settings.timezone).date;
  db.people[0].birthday = { month: Number(today.slice(5, 7)), day: Number(today.slice(8)) };
  db.reminders[0].date = today;
  db.reminders[0].title = 'Nur für Lea';
  db.entries.push({
    id: 'shared-note',
    personIds: ['lea', 'jonas'],
    kind: 'note',
    contactType: '',
    text: 'Gemeinsame Erinnerung bleibt erhalten.',
    date: today,
    createdAt: db.people[0].createdAt
  });
  const response = await page.request.post('/einstellungen?/import', {
    headers: { origin: 'http://127.0.0.1:4173' },
    multipart: {
      confirm: 'on',
      file: {
        name: 'contacts.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(db))
      }
    }
  });
  expect(response.ok()).toBe(true);
  await page.goto('/personen/lea');
  return db;
}

test('profile trash can be cancelled and restores through settings with history and reminders intact', async ({
  page
}, info) => {
  const initial = await seed(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'In den Papierkorb', exact: true }).click();
  expect(await exported(page)).toEqual(initial);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'In den Papierkorb', exact: true }).click();
  await expect(page).toHaveURL(/\/personen$/);
  await expect(page.locator('a.person-row')).toHaveCount(2);
  await expect(page.getByRole('option', { name: 'Nur Lea', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Papierkorb/ })).toHaveCount(0);
  const deleted = await exported(page);
  expect(deleted.people[0].deletedAt).toBeTruthy();
  expect(deleted.schemaVersion).toBe(1);
  expect(deleted.entries).toEqual(initial.entries);
  expect(deleted.relationships).toEqual(initial.relationships);
  expect(deleted.reminders).toEqual(initial.reminders);
  await page.goto('/');
  await expect(page.getByText('Nur für Lea', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Lea Müller hat Geburtstag', { exact: true })).toHaveCount(0);
  await page.goto('/kalender');
  await expect(page.getByText('Lea Müller hat Geburtstag', { exact: true })).toHaveCount(0);
  await page.goto('/personen/jonas');
  await expect(
    page.getByText('Gemeinsame Erinnerung bleibt erhalten.', { exact: true })
  ).toBeVisible();
  await expect(page.locator('a[href="/personen/lea"]')).toHaveCount(0);
  const hidden = await page.goto('/personen/lea');
  expect(hidden!.status()).toBe(404);
  await page.goto('/einstellungen');
  await page.getByRole('link', { name: 'Papierkorb (1)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Papierkorb.', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Kontakte im Papierkorb' })).toContainText(
    'Lea Müller'
  );
  await page.screenshot({ path: info.outputPath('trash.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Lea Müller wiederherstellen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Der Papierkorb ist leer.' })).toBeVisible();
  expect((await exported(page)).people[0].deletedAt).toBeUndefined();
  await page.goto('/personen/lea');
  await expect(page.getByRole('heading', { name: 'Lea Müller', exact: true })).toBeVisible();
  await expect(page.getByText('Nur für Lea', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Gemeinsame Erinnerung bleibt erhalten.', { exact: true })
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('profile-trash-action.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('bulk trash only includes visible selections and stale profile submissions cannot bring a contact back', async ({
  page
}, info) => {
  await seed(page);
  const stale = await page.context().newPage();
  await stale.goto('/personen/lea');
  await stale.getByRole('button', { name: 'Profil bearbeiten', exact: true }).click();
  await page.goto('/personen');
  await page.getByRole('button', { name: 'Kontakte auswählen', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Lea Müller auswählen', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Jonas Weber auswählen', exact: true }).check();
  await page.getByRole('textbox', { name: 'Personen durchsuchen' }).fill('Lea');
  await expect(page.getByText('1 ausgewählt', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Auswahl in den Papierkorb', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Papierkorb verschoben');
  let data = await exported(page);
  expect(data.people.filter((p) => p.deletedAt).map((p) => p.id)).toEqual(['lea']);
  await stale.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(
    stale.getByRole('dialog', { name: 'Profil bearbeiten' }).getByRole('alert')
  ).toContainText('Papierkorb');
  expect((await exported(page)).people[0].deletedAt).toBeTruthy();
  await stale.close();
  await page.getByRole('textbox', { name: 'Personen durchsuchen' }).fill('');
  await page.getByRole('button', { name: 'Kontakte auswählen', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Alle angezeigten auswählen', exact: true }).check();
  await expect(page.getByText('2 ausgewählt', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('bulk-selection.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Auswahl in den Papierkorb', exact: true }).click();
  await expect(page.locator('a.person-row')).toHaveCount(0);
  data = await exported(page);
  expect(data.people.filter((p) => p.deletedAt)).toHaveLength(3);
  await page.goto('/einstellungen');
  await page.getByRole('link', { name: 'Papierkorb (3)', exact: true }).click();
  await page.getByRole('button', { name: 'Jonas Weber wiederherstellen', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Kontakt wiederhergestellt.');
  await page.goto('/personen');
  await expect(page.locator('a.person-row')).toHaveCount(1);
  await expect(page.locator('a.person-row')).toContainText('Jonas Weber');
});
