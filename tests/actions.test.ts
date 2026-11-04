import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { temporaryDirectory, fixture } from './helpers.ts';
import { createEntry, createReminder, changeReminder } from '../src/lib/server/actions.ts';
import { runtime } from '../src/lib/server/runtime.ts';
import { lastContact } from '../src/lib/agenda.ts';
import { addDays, localClock } from '../src/lib/dates.ts';

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, values] of Object.entries(fields))
    for (const value of Array.isArray(values) ? values : [values]) data.append(key, value);
  return data;
}
test('real actions distinguish notes from contact and manage interval, pause, snooze and completion', async (t) => {
  process.env.DATA_DIR = await temporaryDirectory(t);
  const salt = '0123456789abcdef0123456789abcdef';
  process.env.PASSWORD_HASH = `scrypt:${salt}:${scryptSync('tests-only', salt, 64).toString('hex')}`;
  process.env.SESSION_SECRET = 'test-only-session-secret-'.repeat(3);
  process.env.ORIGIN = 'http://localhost:3000';
  const { store } = await runtime();
  await store.import(fixture());
  const today = localClock(new Date(), 'Europe/Berlin').date;
  await createReminder(
    form({ personIds: 'lea', recurrence: 'interval', intervalDays: '56', title: 'Bei Lea melden' })
  );
  const interval = store.snapshot().reminders.find((r) => r.recurrence === 'interval')!;
  assert.equal(interval.date, addDays(today, 56));
  await createEntry(form({ personIds: 'lea', kind: 'note', date: today, text: 'Geschenkidee' }));
  assert.equal(lastContact(store.snapshot(), 'lea'), undefined);
  await createEntry(
    form({
      personIds: ['lea', 'jonas'],
      kind: 'contact',
      contactType: 'Getroffen',
      date: addDays(today, -10),
      text: 'Kaffee',
      followUp: today,
      followUpTitle: 'Rezept schicken'
    })
  );
  assert.equal(lastContact(store.snapshot(), 'lea'), addDays(today, -10));
  assert.equal(lastContact(store.snapshot(), 'jonas'), addDays(today, -10));
  assert.equal(
    store.snapshot().reminders.find((r) => r.id === interval.id)!.date,
    addDays(today, 46)
  );
  await createEntry(
    form({ personIds: 'lea', kind: 'contact', date: addDays(today, -20), text: '' })
  );
  assert.equal(
    store.snapshot().reminders.find((r) => r.id === interval.id)!.date,
    addDays(today, 46)
  );
  const followUp = store.snapshot().reminders.find((r) => r.title === 'Rezept schicken')!;
  await changeReminder(
    form({ id: followUp.id, operation: 'snooze', occurrence: today, until: addDays(today, 2) })
  );
  assert.equal(
    store.snapshot().reminders.find((r) => r.id === followUp.id)!.snooze!.date,
    addDays(today, 2)
  );
  await changeReminder(form({ id: followUp.id, operation: 'pause' }));
  assert.equal(store.snapshot().reminders.find((r) => r.id === followUp.id)!.state, 'paused');
  await changeReminder(form({ id: followUp.id, operation: 'resume' }));
  await changeReminder(form({ id: followUp.id, operation: 'complete', occurrence: today }));
  assert.equal(store.snapshot().reminders.find((r) => r.id === followUp.id)!.state, 'done');
  const before = store.snapshot();
  await assert.rejects(
    createEntry(form({ personIds: 'lea', kind: 'contact', date: today, followUp: 'not-a-date' })),
    /ungültig/
  );
  assert.deepEqual(store.snapshot(), before);
});
