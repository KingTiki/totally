import { test, expect, type Page } from '@playwright/test';
import { authenticate } from './helpers.ts';
import { localClock, addDays } from '../../src/lib/dates.ts';
import type { Database } from '../../src/lib/model.ts';

const exported = async (page: Page) =>
  (await (await page.request.get('/export?format=json')).json()) as Database;
async function person(page: Page, name: string) {
  await page.goto('/personen');
  await page.getByRole('button', { name: 'Person hinzufügen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Person anlegen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  return page.url();
}

test('topics group shared history, survive completion/import and editable contacts update the right rhythm', async ({
  page
}, info) => {
  await authenticate(page);
  const today = localClock(new Date(), 'Europe/Berlin').date;
  const friendName = `Milo Themen ${info.project.name}`;
  const friend = await person(page, friendName);
  const profile = await person(page, `Sofia Themen ${info.project.name}`),
    personId = profile.split('/').at(-1)!;
  await page
    .getByRole('region', { name: 'Kontaktrhythmus', exact: true })
    .getByRole('button', { name: 'Kontaktrhythmus festlegen', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Alle 2 Wochen', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Rhythmus speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Kontakt festhalten', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Datum', { exact: true }).fill(addDays(today, -5));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Eintrag speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const topics = page.getByRole('region', { name: 'Laufende Themen', exact: true }),
    title = `Wohnungssuche ${info.project.name}`;
  await topics.getByRole('button', { name: 'Thema hinzufügen', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Thema', { exact: true }).fill(title);
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Worum geht es?', exact: true })
    .fill('Sucht eine Wohnung im Norden.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Thema anlegen', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let db = await exported(page);
  const topicId = db.topics.find((t) => t.personId === personId)!.id;
  const rhythmId = db.reminders.find(
    (r) => r.recurrence === 'interval' && r.personIds.includes(personId)
  )!.id;
  await topics.getByRole('button', { name: `Eintrag zu ${title} hinzufügen`, exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Thema', exact: true })).toHaveValue(topicId);
  await dialog
    .getByRole('textbox', { name: 'Notiz', exact: true })
    .fill('Besichtigung gemeinsam geplant.');
  await dialog.getByRole('checkbox', { name: friendName, exact: true }).check();
  await dialog.getByLabel('Später aufgreifen').fill(addDays(today, 3));
  await dialog.getByLabel('Woran erinnern?').fill(`Nach Besichtigung fragen ${info.project.name}`);
  await dialog.getByRole('button', { name: 'Eintrag speichern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  db = await exported(page);
  const entryId = db.entries.find((e) => e.topicId === topicId)!.id;
  const history = page.getByRole('region', { name: 'Eure Geschichte', exact: true });
  const row = history.locator(`[data-entry-id="${entryId}"]`);
  await row.getByRole('button', { name: 'Eintrag bearbeiten', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Eintrag bearbeiten', exact: true });
  await expect(dialog.getByRole('checkbox', { name: friendName, exact: true })).toBeChecked();
  await expect(dialog.getByLabel('Später aufgreifen')).toHaveCount(0);
  await dialog
    .getByRole('textbox', { name: 'Notiz', exact: true })
    .fill('Besichtigung findet am Freitag statt.');
  await dialog.getByLabel('Datum', { exact: true }).fill(addDays(today, -1));
  await dialog.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await exported(page)).reminders.find((r) => r.id === rhythmId)!.date).toBe(
    addDays(today, 9)
  );
  await expect(row).toContainText('Bearbeitet');
  await page.goto(friend);
  await expect(row).toContainText('Besichtigung findet am Freitag statt.');
  await row.getByRole('button', { name: 'Eintrag bearbeiten', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Kontakt festhalten', exact: true }).check();
  await dialog
    .getByRole('combobox', { name: 'Kontaktart', exact: true })
    .selectOption('Telefoniert');
  await dialog.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await exported(page)).reminders.find((r) => r.id === rhythmId)!.date).toBe(
    addDays(today, 13)
  );
  await row.getByRole('button', { name: 'Eintrag bearbeiten', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Datum', { exact: true }).fill(addDays(today, -10));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Änderungen speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await exported(page)).reminders.find((r) => r.id === rhythmId)!.date).toBe(
    addDays(today, 9)
  );
  await page.goto(profile);
  await topics.getByText('1 Eintrag zum Thema', { exact: true }).click();
  await expect(topics.locator(`[data-entry-id="${entryId}"]`)).toContainText(
    'Besichtigung findet am Freitag statt.'
  );
  await topics.getByRole('button', { name: `Thema ${title} bearbeiten`, exact: true }).click();
  const renamed = `Umzug ${info.project.name}`;
  await page.getByRole('dialog').getByLabel('Thema', { exact: true }).fill(renamed);
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Worum geht es?', exact: true })
    .fill('Die Wohnung ist gefunden, jetzt steht der Umzug an.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Änderungen speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row.getByRole('link', { name: renamed, exact: true })).toBeVisible();
  await topics.getByRole('button', { name: `Thema ${renamed} abschließen`, exact: true }).click();
  await topics.getByText('Abgeschlossene Themen (1)', { exact: true }).click();
  await expect(topics.getByRole('article', { name: renamed, exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Eintrag bearbeiten', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('combobox', { name: 'Thema', exact: true })
  ).toHaveValue(topicId);
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Was gibt es Neues?', exact: true })
    .fill('Die gemeinsame Besichtigung war erfolgreich.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Änderungen speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await exported(page)).topics.find((t) => t.id === topicId)!.state).toBe('done');
  await topics.getByRole('button', { name: `Thema ${renamed} wieder öffnen`, exact: true }).click();
  await expect(topics.getByRole('article', { name: renamed, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath('topics-profile.png'),
    fullPage: true,
    animations: 'disabled'
  });
  const snapshot = await exported(page);
  await page.goto('/einstellungen');
  await page.getByText('Daten wiederherstellen', { exact: true }).click();
  await page.getByLabel('Sicherungsdatei', { exact: true }).setInputFiles({
    name: 'topics.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(snapshot))
  });
  await page.getByLabel('Ich möchte den aktuellen Datenbestand ersetzen.').check();
  await page.getByRole('button', { name: 'Prüfen und importieren', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Daten importiert');
  expect(await exported(page)).toEqual(snapshot);
});

test('history edit protects unsaved text and rejects changes from a stale second tab', async ({
  page
}, info) => {
  await authenticate(page);
  const profile = await person(page, `Historie ${info.project.name}`);
  await page.getByRole('button', { name: 'Notiz erfassen', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Notiz', exact: true })
    .fill('Ursprünglicher Eintrag');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Eintrag speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const history = page.getByRole('region', { name: 'Eure Geschichte', exact: true });
  await history.getByRole('button', { name: 'Eintrag bearbeiten', exact: true }).click();
  const dialog = page.getByRole('dialog'),
    text = dialog.getByRole('textbox', { name: 'Notiz', exact: true });
  await text.fill('Nicht verwerfen');
  const asked = page.waitForEvent('dialog');
  const key = text.press('Escape');
  await (await asked).dismiss();
  await key;
  await expect(text).toHaveValue('Nicht verwerfen');
  const other = await page.context().newPage();
  await other.goto(profile);
  await other
    .getByRole('region', { name: 'Eure Geschichte', exact: true })
    .getByRole('button', { name: 'Eintrag bearbeiten', exact: true })
    .click();
  await other
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Notiz', exact: true })
    .fill('Änderung im anderen Tab');
  await other
    .getByRole('dialog')
    .getByRole('button', { name: 'Änderungen speichern', exact: true })
    .click();
  await expect(other.getByRole('dialog')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('inzwischen geändert');
  await expect(text).toHaveValue('Nicht verwerfen');
  const discard = page.waitForEvent('dialog');
  const close = dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await (await discard).accept();
  await close;
  await page.reload();
  await expect(history).toContainText('Änderung im anderen Tab');
  await expect(history).not.toContainText('Nicht verwerfen');
  await other.close();
});
