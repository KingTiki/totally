import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { temporaryDirectory, fixture } from './helpers.ts';
import { runtime } from '../src/lib/server/runtime.ts';
import {
  createEntry,
  deleteEntry,
  updateEntry,
  saveTopic,
  saveContactRhythm,
  changeReminder
} from '../src/lib/server/actions.ts';
import { JsonStore } from '../src/lib/server/store.ts';
import { lastContact } from '../src/lib/agenda.ts';
import { addDays, localClock } from '../src/lib/dates.ts';
import type { Entry } from '../src/lib/model.ts';

function fields(values: Record<string, string | string[]>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values))
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  return form;
}
const deletion = (entry: Entry, extra: Record<string, string> = {}) =>
  fields({
    id: entry.id,
    version: entry.updatedAt || entry.createdAt,
    confirm: 'on',
    ...extra
  });

test('history deletion requires confirmation and the current version, preserves topics and reminders and recalculates shared contacts', async (t) => {
  process.env.DATA_DIR = await temporaryDirectory(t);
  const salt = '0123456789abcdef0123456789abcdef';
  process.env.PASSWORD_HASH = `scrypt:${salt}:${scryptSync('tests-only', salt, 64).toString('hex')}`;
  process.env.SESSION_SECRET = 'history-deletion-tests-only-'.repeat(3);
  process.env.ORIGIN = 'http://localhost:3000';
  const { store } = await runtime();
  await store.import(fixture());
  const today = localClock(new Date(), 'Europe/Berlin').date;
  await saveContactRhythm('lea', fields({ operation: 'save', intervalDays: '28' }));
  await saveContactRhythm('jonas', fields({ operation: 'save', intervalDays: '56' }));
  await saveContactRhythm('jonas', fields({ operation: 'pause' }));
  const rhythm = (id: string) =>
    store
      .snapshot()
      .reminders.find((r) => r.recurrence === 'interval' && r.personIds.includes(id))!;
  await saveTopic('lea', fields({ operation: 'save', title: 'Wohnungssuche' }));
  const topicId = store.snapshot().topics[0].id;
  await createEntry(
    fields({
      personIds: ['lea', 'jonas'],
      kind: 'note',
      date: today,
      text: 'Gemeinsame Notiz',
      topicId,
      followUp: addDays(today, 3),
      followUpTitle: 'Nachfragen bleibt erhalten'
    })
  );
  const note = store.snapshot().entries.at(-1)!;
  const unchanged = store.snapshot();
  await assert.rejects(deleteEntry('lea', deletion(note, { confirm: '' })), /bestätigen/);
  await assert.rejects(deleteEntry('missing', deletion(note)), /nicht gefunden/);
  await assert.rejects(deleteEntry('lea', deletion(note, { id: 'missing' })), /nicht gefunden/);
  await assert.rejects(deleteEntry('lea', deletion(note, { version: '' })), /inzwischen/);
  assert.deepEqual(store.snapshot(), unchanged);
  await updateEntry(
    'lea',
    fields({
      id: note.id,
      version: note.createdAt,
      personIds: note.personIds,
      kind: 'note',
      date: today,
      text: 'Inzwischen korrigiert',
      topicId
    })
  );
  const current = store.snapshot().entries.find((entry) => entry.id === note.id)!;
  const beforeDelete = store.snapshot();
  await assert.rejects(deleteEntry('lea', deletion(note)), /inzwischen/);
  assert.deepEqual(store.snapshot(), beforeDelete);
  await deleteEntry('jonas', deletion(current));
  assert.equal(
    store.snapshot().entries.some((entry) => entry.id === note.id),
    false
  );
  assert.deepEqual(store.snapshot().reminders, beforeDelete.reminders);
  assert.deepEqual(store.snapshot().people, beforeDelete.people);
  assert.equal(store.snapshot().topics[0].state, 'active');
  assert(store.snapshot().topics[0].updatedAt > beforeDelete.topics[0].updatedAt);
  await assert.rejects(deleteEntry('lea', deletion(current)), /nicht gefunden/);

  const contacts: Entry[] = [];
  for (const ago of [10, 5, 2]) {
    await createEntry(
      fields({
        personIds: ['lea', 'jonas'],
        kind: 'contact',
        date: addDays(today, -ago),
        text: `Kontakt vor ${ago} Tagen`
      })
    );
    contacts.push(store.snapshot().entries.at(-1)!);
  }
  await deleteEntry('lea', deletion(contacts[2]));
  assert.equal(lastContact(store.snapshot(), 'lea'), addDays(today, -5));
  assert.equal(lastContact(store.snapshot(), 'jonas'), addDays(today, -5));
  assert.equal(rhythm('lea').date, addDays(today, 23));
  assert.equal(rhythm('jonas').date, addDays(today, 51));
  assert.equal(rhythm('jonas').state, 'paused');
  await changeReminder(
    fields({ id: rhythm('lea').id, operation: 'complete', occurrence: rhythm('lea').date })
  );
  const manualCycle = rhythm('lea');
  await deleteEntry('jonas', deletion(contacts[0]));
  assert.deepEqual(
    rhythm('lea'),
    manualCycle,
    'deleting an older contact preserves a manually restarted cycle'
  );
  await deleteEntry('jonas', deletion(contacts[1]));
  assert.equal(lastContact(store.snapshot(), 'lea'), undefined);
  assert.equal(lastContact(store.snapshot(), 'jonas'), undefined);
  assert.equal(
    rhythm('lea').date,
    addDays(localClock(new Date(rhythm('lea').createdAt), 'Europe/Berlin').date, 28)
  );
  assert.equal(rhythm('jonas').state, 'paused');
  assert.equal(
    store.snapshot().reminders.find((r) => r.title === 'Nachfragen bleibt erhalten')?.state,
    'active'
  );
  const restarted = new JsonStore(process.env.DATA_DIR!);
  await restarted.load();
  assert.deepEqual(restarted.snapshot(), store.snapshot());
});
