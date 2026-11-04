import { test, expect, type Page } from '@playwright/test';
import { authenticate } from './helpers.ts';
import { addDays, localClock } from '../../src/lib/dates.ts';
import type { Database } from '../../src/lib/model.ts';

async function createPerson(page: Page, name: string) {
  await page.goto('/personen');
  await page.getByRole('button', { name: 'Person hinzufügen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Person hinzufügen', exact: true });
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Person anlegen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  return page.url();
}
const exported = async (page: Page) =>
  (await (await page.request.get('/export?format=json')).json()) as Database;

test('rhythm is configured per person, reacts to contacts instead of notes and can pause, resume or switch off', async ({
  page
}, info) => {
  await authenticate(page);
  const today = localClock(new Date(), 'Europe/Berlin').date;
  const lea = await createPerson(page, `Rhythmus Lea ${info.project.name}`),
    leaId = lea.split('/').at(-1)!;
  const card = page.getByRole('region', { name: 'Kontaktrhythmus', exact: true });
  await page.getByRole('button', { name: 'Kontakt festhalten', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Datum', { exact: true }).fill(addDays(today, -40));
  await dialog.getByRole('button', { name: 'Eintrag speichern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await card.getByRole('button', { name: 'Kontaktrhythmus festlegen', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Kontaktrhythmus einstellen', exact: true });
  await dialog.getByRole('button', { name: 'Alle 4 Wochen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Rhythmus speichern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toContainText('Überfällig seit');
  let db = await exported(page);
  const id = db.reminders.find(
    (r) => r.personIds.includes(leaId) && r.recurrence === 'interval'
  )!.id;
  expect(db.reminders.find((r) => r.id === id)!.date).toBe(addDays(today, -12));
  await page.getByRole('button', { name: 'Notiz erfassen', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Notiz', exact: true })
    .fill('Verändert den Kontaktabstand nicht.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Eintrag speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await exported(page)).reminders.find((r) => r.id === id)!.date).toBe(addDays(today, -12));
  const jonas = await createPerson(page, `Rhythmus Jonas ${info.project.name}`),
    jonasId = jonas.split('/').at(-1)!;
  await card.getByRole('button', { name: 'Kontaktrhythmus festlegen', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Alle 8 Wochen', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Rhythmus speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto(lea);
  await card.getByRole('button', { name: 'Ändern', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Alle 8 Wochen', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Rhythmus speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await exported(page)).reminders.find((r) => r.id === id)!.date).toBe(addDays(today, 16));
  await card.getByRole('button', { name: 'Pausieren', exact: true }).click();
  await expect(card.getByText('Pausiert', { exact: true })).toBeVisible();
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: `Bei Rhythmus Lea ${info.project.name} melden`, exact: true })
  ).toHaveCount(0);
  await page.goto(lea);
  await page.getByRole('button', { name: 'Kontakt festhalten', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('checkbox', { name: `Rhythmus Jonas ${info.project.name}`, exact: true })
    .check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Eintrag speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  db = await exported(page);
  expect(db.reminders.find((r) => r.id === id)!.state).toBe('paused');
  expect(db.reminders.find((r) => r.id === id)!.date).toBe(addDays(today, 56));
  expect(
    db.reminders.find((r) => r.recurrence === 'interval' && r.personIds.includes(jonasId))!.date
  ).toBe(addDays(today, 56));
  await card.getByRole('button', { name: 'Fortsetzen', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Pausieren', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Ändern', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Kontakt ungefähr alle … Tage').fill('10');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Rhythmus speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(card).toContainText('Alle 10 Tage');
  expect((await exported(page)).reminders.find((r) => r.id === id)!.date).toBe(addDays(today, 10));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: info.outputPath('contact-rhythm-profile.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await card.getByRole('button', { name: 'Ändern', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Kontaktrhythmus ausschalten', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: 'Kontaktrhythmus festlegen', exact: true })
  ).toBeVisible();
  expect((await exported(page)).reminders.find((r) => r.id === id)!.state).toBe('done');
});

test('previously created intervals appear in the profile and legacy duplicates are consolidated without deleting history', async ({
  page
}, info) => {
  await authenticate(page);
  const profile = await createPerson(page, `Bestehender Rhythmus ${info.project.name}`),
    personId = profile.split('/').at(-1)!;
  await page.getByRole('button', { name: 'Erinnerung', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Woran möchtest du denken?').fill('Mein bestehender Rhythmus');
  await dialog.getByLabel('Wiederholung').selectOption('interval');
  await dialog.getByRole('button', { name: 'Erinnerung anlegen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const card = page.getByRole('region', { name: 'Kontaktrhythmus', exact: true });
  await expect(card).toContainText('Alle 8 Wochen');
  const db = await exported(page),
    current = db.reminders.find(
      (r) => r.recurrence === 'interval' && r.personIds.includes(personId)
    )!;
  db.reminders.push({
    ...current,
    id: `legacy-${info.project.name}`,
    title: 'Weiteres altes Kontaktintervall'
  });
  await page.goto('/einstellungen');
  await page.getByText('Daten wiederherstellen', { exact: true }).click();
  await page.getByLabel('Sicherungsdatei', { exact: true }).setInputFiles({
    name: 'legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(db))
  });
  await page.getByLabel('Ich möchte den aktuellen Datenbestand ersetzen.').check();
  await page.getByRole('button', { name: 'Prüfen und importieren', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Daten importiert');
  await page.goto(profile);
  await expect(card).toContainText('Es bestehen 2 Kontaktintervalle');
  await card.getByRole('button', { name: 'Ändern', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('bisherigen 2 Kontaktintervalle');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Alle 4 Wochen', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Rhythmus speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = (await exported(page)).reminders.filter(
    (r) => r.recurrence === 'interval' && r.personIds.includes(personId)
  );
  expect(saved).toHaveLength(2);
  expect(saved.filter((r) => r.state === 'active')).toHaveLength(1);
  await expect(card).toContainText('Alle 4 Wochen');
});
