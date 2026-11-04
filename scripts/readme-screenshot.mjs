// Capture the real English UI with fictional data and isolated test credentials.
// Requires a production build and Playwright Chromium. Never loads .env.
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { emptyDatabase } from '../src/lib/model.ts';
import { createSession } from '../src/lib/server/auth.ts';

const boot = await import('./e2e-server.mjs');
let browser;
try {
  if (!boot.server.listening) await once(boot.server, 'listening');
  browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1040 },
    deviceScaleFactor: 1,
    colorScheme: 'light'
  });
  await context.addCookies([
    {
      name: 'nahbei_session',
      value: createSession(process.env.SESSION_SECRET, process.env.PASSWORD_HASH),
      url: 'http://127.0.0.1:4173',
      httpOnly: true,
      sameSite: 'Strict'
    }
  ]);
  const db = emptyDatabase();
  const timestamp = new Date().toISOString();
  // Calendar dates use the same zone as the demo installation.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: db.settings.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  const after = (days) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  for (const [index, [name, context, days]] of [
    ['Alex Morgan', 'A friend from university', 0],
    ['Jamie Parker', 'Our hiking group', 4],
    ['Sam Taylor', 'A former colleague', 24]
  ].entries()) {
    const birthday = after(days);
    db.people.push({
      id: `demo-person-${index}`,
      name,
      context,
      email: '',
      phone: '',
      location: '',
      tags: ['Friends'],
      notes: '',
      birthday: { month: Number(birthday.slice(5, 7)), day: Number(birthday.slice(8)) },
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }
  for (const [index, [title, days, person]] of [
    ['Ask how the new job is going', 1, 2],
    ['Make plans for a weekend hike', 8, 1]
  ].entries()) {
    db.reminders.push({
      id: `demo-reminder-${index}`,
      personIds: [`demo-person-${person}`],
      title,
      date: after(days),
      recurrence: 'once',
      state: 'active',
      completed: [],
      createdAt: timestamp
    });
  }
  const imported = await context.request.post('/einstellungen?/import', {
    headers: { origin: 'http://127.0.0.1:4173' },
    multipart: {
      confirm: 'on',
      file: {
        name: 'fictional-demo.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(db))
      }
    }
  });
  if (!imported.ok()) throw new Error(`Demo import failed: ${imported.status()}`);
  const language = await context.request.post('/einstellungen?/language', {
    headers: { origin: 'http://127.0.0.1:4173' },
    form: { language: 'en' }
  });
  if (!language.ok()) throw new Error(`Language selection failed: ${language.status()}`);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('heading', { name: 'Coming up.', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  if ((await page.locator('html').getAttribute('lang')) !== 'en') {
    throw new Error('Screenshot must use the English UI.');
  }
  await page.screenshot({
    path: 'docs/assets/overview.png',
    animations: 'disabled',
    fullPage: true
  });
  console.log('Saved docs/assets/overview.png (English UI, fictional data).');
} finally {
  await browser?.close();
  const closed = once(boot.server, 'close');
  boot.shutdown();
  await closed;
}
