import { test, expect } from '@playwright/test';
import { authenticate } from './helpers.ts';
import { emptyDatabase } from '../../src/lib/model.ts';
import { localClock } from '../../src/lib/dates.ts';

test.afterEach(async ({ page }) => {
  await authenticate(page);
  const result = await page.request.post('/einstellungen?/language', {
    headers: { origin: 'http://127.0.0.1:4173' },
    form: { language: 'de' }
  });
  expect(result.ok()).toBe(true);
});

test('language persists across browsers and login, leaves dates and user data unchanged', async ({
  page,
  browser
}, info) => {
  await authenticate(page);
  const db = emptyDatabase();
  const today = localClock(new Date(), db.settings.timezone).date;
  const timestamp = new Date().toISOString();
  db.people.push({
    id: 'language-person',
    name: 'Mara Beispiel',
    context: 'Freundin aus dem Studium',
    email: '',
    phone: '',
    location: '',
    tags: ['Freunde'],
    notes: 'Diesen Text bitte so lassen.',
    birthday: { day: Number(today.slice(8)), month: Number(today.slice(5, 7)) },
    createdAt: timestamp,
    updatedAt: timestamp
  });
  db.entries.push({
    id: 'language-entry',
    personIds: ['language-person'],
    kind: 'contact',
    contactType: 'Telefoniert',
    text: 'Über den Urlaub gesprochen.',
    date: today,
    createdAt: timestamp
  });
  db.reminders.push({
    id: 'language-reminder',
    personIds: ['language-person'],
    title: 'Nach dem Urlaub fragen',
    date: today,
    recurrence: 'once',
    state: 'active',
    completed: [],
    createdAt: timestamp
  });
  const imported = await page.request.post('/einstellungen?/import', {
    headers: { origin: 'http://127.0.0.1:4173' },
    multipart: {
      confirm: 'on',
      file: {
        name: 'language.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(db))
      }
    }
  });
  expect(imported.ok()).toBe(true);
  await page.goto('/');
  const date = await page
    .locator(info.project.name === 'mobile' ? '.mobile-date' : '.topbar-date')
    .textContent();
  await page.goto('/einstellungen');
  await page.getByLabel('Sprache', { exact: true }).selectOption('en');
  await page.getByRole('button', { name: 'Sprache speichern', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings.', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByLabel('Language', { exact: true })).toHaveValue('en');
  await expect(page.locator('input[type="time"]')).toHaveAttribute('lang', 'de');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByLabel('Language', { exact: true })).toHaveValue('en');
  await page.screenshot({ path: info.outputPath('settings-english.png'), fullPage: true });
  const invalid = await page.request.post('/einstellungen?/language', {
    headers: { origin: 'http://127.0.0.1:4173' },
    form: { language: 'fr' }
  });
  expect(invalid.status()).toBe(400);
  expect(await invalid.text()).toContain('Please select English or German.');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Coming up.', exact: true })).toBeVisible();
  await expect(
    page.locator(info.project.name === 'mobile' ? '.mobile-date' : '.topbar-date')
  ).toHaveText(date!);
  await expect(
    page.getByRole('heading', { name: "Mara Beispiel's birthday", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Nach dem Urlaub fragen', exact: true })
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('overview-english.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/kalender');
  await expect(page.getByRole('heading', { name: 'Your calendar.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add reminder', exact: true }).first().click();
  const reminder = page.getByRole('dialog', { name: 'Add reminder' });
  await expect(reminder.getByPlaceholder('Ask how the job interview went')).toBeVisible();
  await expect(reminder.locator('input[type="date"]')).toHaveAttribute('lang', 'de');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/personen');
  await expect(page.getByRole('heading', { name: 'Your people.', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search by name, address or context …')).toBeVisible();
  await page.goto('/einstellungen/papierkorb');
  await expect(page.getByRole('heading', { name: 'Trash.', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'The trash is empty.', exact: true })
  ).toBeVisible();
  await page.goto('/personen/language-person');
  await expect(page.getByText('Diesen Text bitte so lassen.', { exact: true })).toBeVisible();
  await expect(page.locator('.timeline-meta strong')).toHaveText('Called');
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit profile' })).toBeVisible();
  await expect(page.getByPlaceholder('First and last name')).toHaveValue('Mara Beispiel');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Log contact', exact: true }).click();
  const contact = page.getByRole('dialog', { name: 'Log contact' });
  await expect(contact.getByRole('option', { name: 'Called', exact: true })).toHaveAttribute(
    'value',
    'Telefoniert'
  );
  await expect(contact.getByPlaceholder('What would you like to remember?')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Add topic', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Add topic' })
      .getByPlaceholder('For example: Finding a new home')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const exported = await page.request.get('/export?format=json');
  const saved = await exported.json();
  expect(saved.entries[0].contactType).toBe('Telefoniert');
  expect(saved.settings).not.toHaveProperty('language');
  const other = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: page.viewportSize() ?? { width: 1280, height: 720 },
    javaScriptEnabled: false
  });
  try {
    const second = await other.newPage();
    await second.goto('/login');
    await expect(second.locator('html')).toHaveAttribute('lang', 'en');
    await expect(second.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await second.screenshot({ path: info.outputPath('login-english.png'), fullPage: true });
    await authenticate(second);
    await second.goto('/einstellungen');
    await expect(second.getByLabel('Language', { exact: true })).toHaveValue('en');
    // The selection also works without JavaScript and applies to other devices.
    await second.getByLabel('Language', { exact: true }).selectOption('de');
    await second.getByRole('button', { name: 'Save language', exact: true }).click();
    await expect(second.locator('html')).toHaveAttribute('lang', 'de');
    await expect(
      second.getByRole('heading', { name: 'Einstellungen.', exact: true })
    ).toBeVisible();
  } finally {
    await other.close();
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Demnächst.', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});
