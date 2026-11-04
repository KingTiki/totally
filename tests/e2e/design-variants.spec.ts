import { test, expect } from '@playwright/test';
import { authenticate } from './helpers.ts';
import { emptyDatabase } from '../../src/lib/model.ts';
import { addDays, localClock } from '../../src/lib/dates.ts';
import { FOOTER_PHRASES } from '../../src/lib/footer-phrases.ts';

test('design variants keep mobile cards usable and manual themes independent of the device', async ({
  page
}, info) => {
  await authenticate(page);
  const today = localClock(new Date(), 'Europe/Berlin').date;
  const db = emptyDatabase();
  const timestamp = new Date().toISOString();
  for (const [index, name] of ['Jana Hermann', 'Viktoria Hermann'].entries()) {
    const birthday = addDays(today, index ? 52 : 27);
    db.people.push({
      id: `design-person-${index}`,
      name,
      context: 'Freunde',
      email: '',
      phone: '',
      location: '',
      tags: [],
      notes: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      birthday: { month: Number(birthday.slice(5, 7)), day: Number(birthday.slice(8)) }
    });
  }
  for (const [index, title] of [
    'Wohnt die immer noch hier?',
    'Bei Jana Hermann melden',
    'Bei Viktoria Hermann melden'
  ].entries()) {
    db.reminders.push({
      id: `design-reminder-${index}`,
      personIds: [`design-person-${index === 2 ? 1 : 0}`],
      title,
      date: addDays(today, [2, 8, 15][index]),
      recurrence: 'once',
      state: 'active',
      completed: [],
      createdAt: timestamp
    });
  }
  const imported = await page.request.post('/einstellungen?/import', {
    headers: { origin: 'http://127.0.0.1:4173' },
    multipart: {
      confirm: 'on',
      file: {
        name: 'design.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(db))
      }
    }
  });
  expect(imported.ok()).toBe(true);
  const mobile = info.project.name === 'mobile';
  await page.setViewportSize(mobile ? { width: 390, height: 1180 } : { width: 1440, height: 1040 });
  await page.goto('/einstellungen');
  await page
    .getByRole('group', { name: 'Farbschema' })
    .getByRole('radio', { name: 'Hell', exact: true })
    .check();
  await page.goto('/');
  await expect(page.locator('.agenda-row')).toHaveCount(5);
  await expect(page.locator('.event-footer').first()).toContainText('in 2 Tagen');
  const footer = page.locator('.app-footer > span').first();
  const validFooterTexts = FOOTER_PHRASES.map((phrase) => `Wir sollten mal... ${phrase}`);
  expect(validFooterTexts).toContain(await footer.textContent());
  await expect(page.locator('.topbar .wordmark')).toHaveCount(0);
  await expect(page.locator('.footer-brand')).toHaveText('totally! in touch');
  const headerDate = page.locator(mobile ? '.mobile-date' : '.topbar-date');
  await expect(headerDate).toBeVisible();
  const dateBounds = await headerDate.boundingBox();
  const toggleBounds = await page.locator('.theme-toggle').boundingBox();
  expect(dateBounds!.x).toBeLessThan(page.viewportSize()!.width / 2);
  expect(toggleBounds!.x).toBeGreaterThan(page.viewportSize()!.width / 2);
  if (!mobile) {
    await expect(page.locator('.quick-card')).toContainText('Kopf voll?');
    await page.getByRole('button', { name: 'Mach ich.', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Notiz erfassen' })).toBeVisible();
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  }

  for (const theme of ['light', 'dark'] as const) {
    // The explicit selection must win even when the device prefers the opposite.
    await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' });
    const current = await page.locator('html').getAttribute('data-theme');
    if (current !== theme) {
      await page
        .getByRole('button', {
          name: theme === 'dark' ? 'Dunkelmodus aktivieren' : 'Hellmodus aktivieren'
        })
        .click();
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.reload();
    expect(validFooterTexts).toContain(await footer.textContent());
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();
    await expect(page.locator('.footer-brand')).toBeVisible();
    await page.locator('.app-footer').screenshot({
      path: info.outputPath(`footer-${theme}.png`),
      animations: 'disabled'
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('html')).toHaveCSS(
      'background-color',
      theme === 'dark' ? 'rgb(20, 25, 22)' : 'rgb(246, 245, 240)'
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      theme === 'dark' ? '#141916' : '#f6f5f0'
    );
    await expect(page.getByRole('button', { name: 'Notiz erfassen', exact: true })).toHaveCSS(
      'background-color',
      'rgb(47, 93, 80)'
    );
    if (mobile) {
      await expect(page.locator('.agenda-date').first()).toBeHidden();
      await expect(page.locator('.mobile-event-date').first()).toBeVisible();
      const card = await page.locator('.agenda-row').first().boundingBox();
      expect(card!.width).toBe(350);
      const floating = await page.locator('.capture-button').boundingBox();
      const navigation = await page.locator('.sidebar').boundingBox();
      expect(floating!.y + floating!.height).toBeLessThan(navigation!.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({
      path: info.outputPath(`overview-${theme}.png`),
      animations: 'disabled'
    });
  }

  await page.getByRole('button', { name: 'Notiz erfassen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Notiz erfassen' })).toBeVisible();
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  if (mobile) {
    await page.locator('.action-menu > summary').first().click();
    await page.getByRole('button', { name: 'Kontakt festhalten', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Kontakt festhalten' })).toBeVisible();
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Hellmodus aktivieren' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  }
});
