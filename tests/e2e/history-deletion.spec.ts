import { test, expect } from '@playwright/test';
import { authenticate } from './helpers.ts';
import { emptyDatabase, type Database } from '../../src/lib/model.ts';
import { addDays, localClock } from '../../src/lib/dates.ts';

async function seed(page: import('@playwright/test').Page) {
  await authenticate(page);
  const today = localClock(new Date(), 'Europe/Berlin').date;
  const timestamp = new Date().toISOString();
  const db = emptyDatabase();
  for (const id of ['lea', 'jonas'])
    db.people.push({
      id,
      name: id === 'lea' ? 'Lea' : 'Jonas',
      context: '',
      email: '',
      phone: '',
      location: '',
      tags: [],
      notes: '',
      createdAt: timestamp,
      updatedAt: timestamp
    });
  db.topics.push({
    id: 'moving',
    personId: 'lea',
    title: 'Umzug',
    description: '',
    state: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  });
  for (const [id, kind] of [
    ['shared-note', 'note'],
    ['shared-contact', 'contact']
  ] as const)
    db.entries.push({
      id,
      kind,
      personIds: ['lea', 'jonas'],
      text: id === 'shared-note' ? 'Gemeinsam beim Umzug helfen.' : 'Umzug besprochen.',
      contactType: 'Telefoniert',
      date: today,
      createdAt: timestamp,
      topicId: 'moving'
    });
  db.reminders.push({
    id: 'follow-up',
    personIds: ['lea'],
    title: 'Beim Umzug nachfragen',
    date: addDays(today, 3),
    recurrence: 'once',
    state: 'active',
    completed: [],
    createdAt: timestamp
  });
  const response = await page.request.post('/einstellungen?/import', {
    headers: { origin: 'http://127.0.0.1:4173' },
    multipart: {
      confirm: 'on',
      file: {
        name: 'history.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(db))
      }
    }
  });
  expect(response.ok()).toBe(true);
  await page.goto('/personen/lea');
  return db;
}
const exported = async (page: import('@playwright/test').Page) =>
  (await (await page.request.get('/export?format=json')).json()) as Database;

test('deleting history asks first, cancellation sends nothing and confirmation updates every profile and topic', async ({
  page
}, info) => {
  const initial = await seed(page);
  const history = page.getByRole('region', { name: 'Eure Geschichte', exact: true });
  const note = history.locator('[data-entry-id="shared-note"]');
  let requests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('?/deleteEntry')) requests++;
  });
  const question = page.waitForEvent('dialog');
  const click = note.getByRole('button', { name: 'Eintrag löschen', exact: true }).click();
  const confirmation = await question;
  expect(confirmation.type()).toBe('confirm');
  expect(confirmation.message()).toContain('Gemeinsam beim Umzug helfen.');
  expect(confirmation.message()).toContain('allen 2 verknüpften Personen');
  await confirmation.dismiss();
  await click;
  await expect(note).toBeVisible();
  expect(requests).toBe(0);
  expect(await exported(page)).toEqual(initial);
  await page.screenshot({ path: info.outputPath('history-delete-actions.png'), fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await note.getByRole('button', { name: 'Eintrag löschen', exact: true }).click();
  await expect(note).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Eintrag gelöscht');
  const topics = page.getByRole('region', { name: 'Laufende Themen', exact: true });
  await expect(topics.getByText('1 Eintrag zum Thema', { exact: true })).toBeVisible();
  await page.goto('/personen/jonas');
  await expect(note).toHaveCount(0);
  await expect(history.locator('[data-entry-id="shared-contact"]')).toBeVisible();
  await page.goto('/personen/lea');
  await topics.getByText('1 Eintrag zum Thema', { exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await topics.getByRole('button', { name: 'Eintrag löschen', exact: true }).click();
  await expect(history.locator('[data-entry-id="shared-contact"]')).toHaveCount(0);
  await expect(topics.getByText('1 Eintrag zum Thema', { exact: true })).toHaveCount(0);
  const saved = await exported(page);
  expect(saved.entries).toEqual([]);
  expect(saved.reminders).toEqual(initial.reminders);
  expect(saved.topics[0].state).toBe('active');
  await page.reload();
  await expect(history).toContainText('Das nächste Gespräch ist ein guter Anfang.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a stale tab cannot delete an entry changed elsewhere and unconfirmed requests are rejected', async ({
  page
}) => {
  const initial = await seed(page);
  const before = initial.entries[0];
  const response = await page.request.post('/personen/lea?/deleteEntry', {
    headers: { origin: 'http://127.0.0.1:4173' },
    form: { id: before.id, version: before.createdAt }
  });
  expect(response.status()).toBe(400);
  expect(await exported(page)).toEqual(initial);
  const other = await page.context().newPage();
  await other.goto('/personen/jonas');
  const row = other
    .getByRole('region', { name: 'Eure Geschichte', exact: true })
    .locator('[data-entry-id="shared-note"]');
  await row.getByRole('button', { name: 'Eintrag bearbeiten', exact: true }).click();
  await other
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Notiz', exact: true })
    .fill('Im anderen Tab geändert.');
  await other
    .getByRole('dialog')
    .getByRole('button', { name: 'Änderungen speichern', exact: true })
    .click();
  await expect(other.getByRole('dialog')).toHaveCount(0);
  const stale = page
    .getByRole('region', { name: 'Eure Geschichte', exact: true })
    .locator('[data-entry-id="shared-note"]');
  page.once('dialog', (dialog) => dialog.accept());
  await stale.getByRole('button', { name: 'Eintrag löschen', exact: true }).click();
  await expect(stale.getByRole('alert')).toContainText('inzwischen geändert');
  expect((await exported(page)).entries.find((entry) => entry.id === before.id)?.text).toBe(
    'Im anderen Tab geändert.'
  );
  await page.reload();
  page.once('dialog', (dialog) => dialog.accept());
  await stale.getByRole('button', { name: 'Eintrag löschen', exact: true }).click();
  await expect(stale).toHaveCount(0);
  await other.close();
});
