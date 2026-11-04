import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { localClock, addDays } from '../../src/lib/dates.ts';
import type { Database } from '../../src/lib/model.ts';

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: info.outputPath(name), fullPage: true });
}

async function login(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Dein Passwort').fill('nahbei-browser-tests-only');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Demnächst.' })).toBeVisible();
}
async function createPerson(page: Page, name: string, birthday?: string) {
  await page.goto('/personen');
  await page.getByRole('button', { name: 'Person hinzufügen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByLabel('Kontext', { exact: true }).fill('Freundin aus dem Studium');
  await dialog.getByLabel('Ort', { exact: true }).fill('Hamburg');
  await dialog.getByRole('textbox', { name: /^Tags/ }).fill('Freunde, Studium');
  if (birthday) {
    await dialog.getByLabel('Tag', { exact: true }).fill(String(Number(birthday.slice(8))));
    await dialog
      .getByRole('combobox', { name: /^Monat/ })
      .selectOption(String(Number(birthday.slice(5, 7))));
  }
  await dialog.getByRole('button', { name: 'Person anlegen', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return page.url().split('/').at(-1)!;
}
test('private pages and mutations require authentication and same origin', async ({
  page,
  request
}) => {
  const response = await request.get('/export', { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  await login(page);
  const rejected = await page.request.post('/personen?/create', {
    headers: { origin: 'https://untrusted.example' },
    form: { name: 'Should not exist' }
  });
  expect(rejected.status()).toBe(403);
});
test('person, shared history, reminders, relations, calendar and JSON round-trip', async ({
  page
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  const today = localClock(new Date(), 'Europe/Berlin').date;
  const name = `Lea ${info.project.name}`,
    friend = `Jonas ${info.project.name}`;
  const friendId = await createPerson(page, friend);
  const personId = await createPerson(page, name, today);
  await page.getByRole('button', { name: 'Notiz erfassen', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Notiz', exact: true })
    .fill('Bewerbungsgespräch lief gut. Nächste Woche nachfragen.');
  await dialog.getByLabel('Später aufgreifen').fill(today);
  await dialog.getByLabel('Woran erinnern?').fill(`Nachfragen ${info.project.name}`);
  await dialog.getByRole('button', { name: 'Eintrag speichern' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText('Bewerbungsgespräch lief gut. Nächste Woche nachfragen.', { exact: true })
  ).toBeVisible();
  let db = (await (await page.request.get('/export?format=json')).json()) as Database;
  expect(
    db.entries.filter((e) => e.kind === 'contact' && e.personIds.includes(personId))
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Kontakt festhalten', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(friend, { exact: true }).check();
  await dialog.getByLabel('Was gibt es Neues?').fill('Gemeinsam Kaffee getrunken.');
  await dialog.getByRole('button', { name: 'Eintrag speichern' }).click();
  await expect(dialog).not.toBeVisible();
  db = (await (await page.request.get('/export?format=json')).json()) as Database;
  expect(
    db.entries.find((e) => e.kind === 'contact' && e.personIds.includes(personId))!.personIds
  ).toContain(friendId);
  await page.getByRole('button', { name: 'Verbindung hinzufügen', exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Verbindung', { exact: true }).fill('kennt über das Studium');
  await dialog.getByLabel('Zu welcher Person?').selectOption(friendId);
  await dialog.getByRole('button', { name: 'Verbindung speichern' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText(`${name} kennt über das Studium ${friend}`, { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Erinnerung', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Woran möchtest du denken?').fill(`Kontakt halten ${info.project.name}`);
  await dialog.getByLabel('Wiederholung').selectOption('interval');
  await dialog.getByLabel('Kontakt ungefähr alle … Tage').fill('56');
  await dialog.getByRole('button', { name: 'Erinnerung anlegen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  db = (await (await page.request.get('/export?format=json')).json()) as Database;
  expect(db.reminders.find((r) => r.title === `Kontakt halten ${info.project.name}`)!.date).toBe(
    addDays(today, 56)
  );
  await capture(page, info, 'profile.png');
  await page.goto('/');
  await page
    .getByLabel(`Nachfragen ${info.project.name}: verschieben oder pausieren`, { exact: true })
    .click();
  await page.getByRole('button', { name: 'Erinnerung pausieren', exact: true }).click();
  await page.getByText(/Pausierte Erinnerungen \(1\)/).click();
  await page.getByRole('button', { name: 'Fortsetzen', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `Nachfragen ${info.project.name}`, exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: `Nachfragen ${info.project.name} erledigen`, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: `Nachfragen ${info.project.name}`, exact: true })
  ).toHaveCount(0);
  await capture(page, info, 'overview.png');
  await page.goto('/kalender');
  await expect(page.getByRole('heading', { name: 'Dein Kalender.' })).toBeVisible();
  await page.getByRole('button', { name: 'Erinnerung anlegen', exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Woran möchtest du denken?').fill(`Jahrestag ${info.project.name}`);
  await dialog.getByLabel('Wiederholung').selectOption('annual');
  await dialog.getByLabel('Erster Termin').fill(today);
  await dialog.getByRole('button', { name: 'Erinnerung anlegen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: `Jahrestag ${info.project.name}`, exact: true })
  ).toBeVisible();
  await capture(page, info, 'calendar.png');
  await page.goto('/personen');
  await page.getByLabel('Personen durchsuchen').fill(name);
  await expect(page.locator('.person-row')).toHaveCount(1);
  await capture(page, info, 'people.png');
  await page.goto('/einstellungen');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'ZIP-Sicherung herunterladen' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/totally-.*\.zip/);
  const snapshot = (await (await page.request.get('/export?format=json')).json()) as Database;
  await page.getByText('Daten wiederherstellen', { exact: true }).click();
  await page.getByLabel('Sicherungsdatei', { exact: true }).setInputFiles({
    name: 'restore.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(snapshot))
  });
  await page.getByLabel('Ich möchte den aktuellen Datenbestand ersetzen.').check();
  await page.getByRole('button', { name: 'Prüfen und importieren' }).click();
  await expect(page.getByRole('status')).toContainText('Daten importiert');
  expect(await (await page.request.get('/export?format=json')).json()).toEqual(snapshot);
  await page.getByLabel('Tägliche Übersicht zusätzlich per E-Mail').check();
  await page.getByRole('button', { name: 'Einstellungen speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Einstellungen gespeichert');
  await expect(page.getByLabel('Versandzeit', { exact: true })).toHaveValue(
    snapshot.settings.digestTime
  );
  await expect(page.getByRole('combobox', { name: 'Zeitzone', exact: true })).toHaveValue(
    snapshot.settings.timezone
  );
  await page.getByRole('button', { name: 'Heutige Übersicht jetzt prüfen' }).click();
  await expect(page.getByText('Fehlgeschlagen', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/SMTP-Versand fehlgeschlagen/).first()).toBeVisible();
  await capture(page, info, 'settings.png');
  await page.getByLabel('Tägliche Übersicht zusätzlich per E-Mail').uncheck();
  await page.getByRole('button', { name: 'Einstellungen speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Einstellungen gespeichert');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Abmelden', exact: true }).last().click();
  await expect(page).toHaveURL(/\/login$/);
});
