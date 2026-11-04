import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preferencesStore } from '../src/lib/server/preferences.ts';
import { JsonStore } from '../src/lib/server/store.ts';
import { validateDatabase } from '../src/lib/server/validation.ts';
import { emptyDatabase } from '../src/lib/model.ts';
import { translator, type Language } from '../src/lib/i18n/index.ts';
import { de } from '../src/lib/i18n/de.ts';
import { en } from '../src/lib/i18n/en.ts';
import { withLanguage, currentLanguage, t } from '../src/lib/server/language.ts';
import { formatDate, birthdayLabel } from '../src/lib/dates.ts';
import { ReminderWorker } from '../src/lib/server/scheduler.ts';
import { pushStore, PushWorker } from '../src/lib/server/push.ts';

async function directory(context: test.TestContext) {
  const path = await mkdtemp(join(tmpdir(), 'totally-language-'));
  context.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('new installations use English and retain an explicit language after disk reload', async (context) => {
  const path = await directory(context);
  const preferences = await preferencesStore(path);
  assert.equal(preferences.snapshot().language, 'en');
  await assert.rejects(readFile(join(path, 'data.json')), { code: 'ENOENT' });
  await preferences.update((draft) => {
    draft.language = 'de';
  });
  assert.equal((await preferencesStore(path)).snapshot().language, 'de');
  const backups = await import('node:fs/promises').then((fs) =>
    fs.readdir(join(path, 'preferences-backups'))
  );
  assert.equal(backups.length, 1);
});

test('existing installations keep German without rewriting CRM data and preferences survive CRM import', async (context) => {
  const path = await directory(context);
  const original = JSON.stringify(emptyDatabase());
  await writeFile(join(path, 'data.json'), original);
  const preferences = await preferencesStore(path);
  assert.equal(preferences.snapshot().language, 'de');
  await preferences.update((draft) => {
    draft.language = 'en';
  });
  assert.equal(await readFile(join(path, 'data.json'), 'utf8'), original);
  const store = new JsonStore(path);
  await store.load();
  await store.import(emptyDatabase());
  assert.equal((await preferencesStore(path)).snapshot().language, 'en');
  assert.deepEqual(Object.keys(store.snapshot().settings).sort(), [
    'digestTime',
    'emailEnabled',
    'timezone'
  ]);
  assert.throws(() => validateDatabase({ ...store.snapshot(), language: 'en' }), /Unbekannte/);
});

test('damaged or missing preference files with backups are never silently reset', async (context) => {
  const path = await directory(context);
  const preferences = await preferencesStore(path);
  await preferences.update((draft) => {
    draft.language = 'de';
  });
  await writeFile(join(path, 'preferences.json'), '{broken');
  await assert.rejects(preferencesStore(path), /preferences.json/);
  assert.equal(await readFile(join(path, 'preferences.json'), 'utf8'), '{broken');
  await unlink(join(path, 'preferences.json'));
  await assert.rejects(preferencesStore(path), /preferences.json fehlt/);
});

test('invalid language updates leave preferences and CRM unchanged', async (context) => {
  const path = await directory(context);
  const preferences = await preferencesStore(path);
  const original = await readFile(join(path, 'preferences.json'), 'utf8');
  await assert.rejects(preferences.import({ language: 'fr' }), /Sprache/);
  await assert.rejects(preferences.import({ language: 'de', extra: true }), /Sprache/);
  assert.equal(await readFile(join(path, 'preferences.json'), 'utf8'), original);
  assert.equal(preferences.snapshot().language, 'en');
});

test('catalogues have matching interpolation fields and preserve arbitrary inserted text', () => {
  const fields = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
  for (const key of Object.keys(de) as (keyof typeof de)[])
    assert.deepEqual(fields(de[key]), fields(en[key]), key);
  const english = translator('en');
  assert.equal(
    english('{p0} hat Geburtstag', { p0: 'Mara {p0} $& <script>' }),
    "Mara {p0} $& <script>'s birthday"
  );
  assert.equal(english.contactType('Telefoniert'), 'Called');
  assert.equal(english.contactType('Unser besonderer Kontakt'), 'Unser besonderer Kontakt');
});

test('concurrent server language scopes stay isolated through asynchronous work', async () => {
  const run = (language: Language) =>
    withLanguage(language, async () => {
      await new Promise((resolve) => setTimeout(resolve, language === 'en' ? 8 : 1));
      assert.throws(
        () => validateDatabase({ ...emptyDatabase(), unexpected: true }),
        language === 'en' ? /Unknown fields/ : /Unbekannte Felder/
      );
      return t('Einstellungen');
    });
  assert.deepEqual(await Promise.all([run('en'), run('de'), run('en')]), [
    'Settings',
    'Einstellungen',
    'Settings'
  ]);
  assert.equal(currentLanguage(), 'de');
});

test('English labels leave the established German date formatting and date order unchanged', () => {
  for (const language of ['en', 'de'] as const)
    withLanguage(language, () => {
      assert.equal(formatDate('2026-10-31'), '31. Oktober');
      assert.equal(
        formatDate('2026-10-31', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        '31.10.2026'
      );
    });
  assert.equal(birthdayLabel({ day: 31, month: 10, year: 2000 }, 2026, 'en'), 'Turns 26');
  assert.equal(birthdayLabel({ day: 31, month: 10, year: 2000 }, 2026, 'de'), 'Wird 26');
});

test('email and push use the persisted language while queued messages keep their original content', async (context) => {
  const path = await directory(context);
  const preferences = await preferencesStore(path);
  const store = new JsonStore(path);
  await store.load();
  const now = new Date('2026-10-31T10:00:00Z');
  await store.update((db) => {
    db.settings.emailEnabled = true;
    db.people.push({
      id: 'demo',
      name: 'Mara Beispiel',
      context: '',
      email: '',
      phone: '',
      location: '',
      tags: ['Freunde'],
      notes: 'Nicht übersetzen',
      birthday: { month: 10, day: 31 },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
    db.reminders.push({
      id: 'followup',
      personIds: ['demo'],
      title: 'Nach dem Urlaub fragen',
      date: '2026-10-31',
      recurrence: 'once',
      state: 'active',
      completed: [],
      createdAt: now.toISOString()
    });
  });
  const language = () => preferences.snapshot().language;
  const mail = new ReminderWorker(
    store,
    async () => {
      throw new Error('offline');
    },
    'https://example.test',
    true,
    undefined,
    language
  );
  await mail.tick(now);
  const original = store.snapshot().deliveries[0];
  assert.equal(original.subject, 'Your overview for 31. Oktober · totally!');
  assert.match(original.text, /Mara Beispiel's birthday/);
  assert.match(original.text, /Nach dem Urlaub fragen/);
  assert.match(original.text, /31. Oktober/);
  const pushState = pushStore(path);
  await pushState.load();
  await pushState.update((state) => {
    state.devices.push({
      id: 'device',
      label: 'Testgerät',
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-language',
      expirationTime: null,
      keys: { p256dh: state.publicKey, auth: Buffer.alloc(16).toString('base64url') },
      createdAt: now.toISOString()
    });
  });
  const payloads: string[] = [];
  const push = new PushWorker(
    pushState,
    store,
    async (_device, payload) => {
      payloads.push(payload.body);
    },
    language
  );
  await push.test('device', now);
  assert.match(payloads[0], /^Push is set up/);
  await push.tick(now);
  assert.match(payloads[1], /^2 reminders are waiting/);
  await preferences.update((draft) => {
    draft.language = 'de';
  });
  await push.test('device', new Date(now.getTime() + 31000));
  assert.match(payloads[2], /^Push ist eingerichtet/);
  let retried = '';
  const retry = new ReminderWorker(
    store,
    async (delivery) => {
      retried = delivery.text;
    },
    'https://example.test',
    true,
    undefined,
    language
  );
  await retry.tick(new Date(now.getTime() + 6 * 60000));
  assert.equal(retried, original.text);
  assert.equal(store.snapshot().people[0].notes, 'Nicht übersetzen');
});
