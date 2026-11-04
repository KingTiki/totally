import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fixture, person, reminder, temporaryDirectory } from './helpers.ts';
import { validateDatabase } from '../src/lib/server/validation.ts';
import { activeDatabase } from '../src/lib/people.ts';
import { agenda, namesFor } from '../src/lib/agenda.ts';
import { runtime } from '../src/lib/server/runtime.ts';
import { JsonStore } from '../src/lib/server/store.ts';
import { createBackup, readBackup } from '../src/lib/server/backup.ts';
import { localClock } from '../src/lib/dates.ts';
import {
  trashPeople,
  restorePerson,
  createEntry,
  createReminder,
  changeReminder,
  saveTopic,
  saveContactRhythm,
  updateEntry,
  deleteEntry,
  personFromForm
} from '../src/lib/server/actions.ts';
import type { Person } from '../src/lib/model.ts';

const timestamp = '2026-10-30T12:00:00.000Z';
function fields(values: Record<string, string | string[]>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values))
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  return form;
}
function trash(people: Person[]) {
  return fields({
    confirm: 'on',
    personIds: people.map((p) => p.id),
    ...Object.fromEntries(people.map((p) => [`version:${p.id}`, p.updatedAt]))
  });
}
const restore = (person: Person) => fields({ id: person.id, version: person.deletedAt! });

test('optional deletedAt preserves old JSON and schemaVersion, rejects invalid markers', () => {
  const old = fixture();
  assert.deepEqual(validateDatabase(old), old);
  assert(!Object.hasOwn(validateDatabase(old).people[0], 'deletedAt'));
  const db = fixture();
  db.people[0].deletedAt = timestamp;
  const parsed = validateDatabase(JSON.parse(JSON.stringify(db)));
  assert.deepEqual(parsed, db);
  assert.equal(parsed.schemaVersion, 1);
  for (const invalid of ['', 'yesterday', '2026-10-99T12:00:00Z', null, 1, {}]) {
    const data = structuredClone(db);
    Object.assign(data.people[0], { deletedAt: invalid });
    assert.throws(() => validateDatabase(data), /Löschzeitpunkt/);
  }
});

test('trash projection hides profiles, topics, relationships and reminders without deleting shared history', () => {
  const db = fixture();
  db.people[0].deletedAt = timestamp;
  db.people[0].birthday = { day: 30, month: 10, year: 1990 };
  db.topics.push({
    id: 'topic',
    personId: 'lea',
    title: 'Privates Thema',
    description: '',
    state: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  });
  db.entries.push({
    id: 'shared',
    personIds: ['lea', 'jonas'],
    kind: 'note',
    contactType: '',
    text: 'Gemeinsam',
    date: '2026-10-30',
    createdAt: timestamp,
    topicId: 'topic'
  });
  db.reminders.push(
    reminder({ id: 'shared-reminder', personIds: ['lea', 'jonas'] }),
    reminder({ id: 'global', personIds: [] }),
    reminder({ id: 'jonas-reminder', personIds: ['jonas'] })
  );
  const original = structuredClone(db);
  const active = activeDatabase(db);
  assert.deepEqual(
    active.people.map((p) => p.id),
    ['jonas']
  );
  assert.deepEqual(active.topics, []);
  assert.deepEqual(active.relationships, []);
  assert.deepEqual(active.entries, db.entries);
  assert.deepEqual(
    active.reminders.map((r) => r.id),
    ['global', 'jonas-reminder']
  );
  assert.deepEqual(
    namesFor(db, ['lea', 'jonas']).map((p) => p.id),
    ['jonas']
  );
  assert.deepEqual(
    agenda(db, '2026-10-01', '2026-10-31')
      .map((i) => i.id)
      .sort(),
    ['global', 'jonas-reminder']
  );
  assert.deepEqual(db, original);
  delete db.people[0].deletedAt;
  assert(
    agenda(db, '2026-10-01', '2026-10-31').some((i) => i.kind === 'birthday' && i.id === 'lea')
  );
  assert.equal(activeDatabase(db).relationships.length, 1);
  assert.equal(activeDatabase(db).reminders.length, db.reminders.length);
});

test('trash and restore are atomic, resist stale forms, retain photos and shared links through export and restart', async (t) => {
  process.env.DATA_DIR = await temporaryDirectory(t);
  const salt = '0123456789abcdef0123456789abcdef';
  process.env.PASSWORD_HASH = `scrypt:${salt}:${scryptSync('trash-tests', salt, 64).toString('hex')}`;
  process.env.SESSION_SECRET = 'trash-tests-only-session-secret-'.repeat(3);
  process.env.ORIGIN = 'http://localhost:3000';
  const { store } = await runtime();
  const db = fixture();
  const photo = await readFile(new URL('./fixtures/profile.jpg', import.meta.url));
  db.people[0].photo = `data:image/jpeg;base64,${photo.toString('base64')}`;
  await store.import(db);
  const today = localClock(new Date(), db.settings.timezone).date;
  await saveTopic('lea', fields({ operation: 'save', title: 'Gemeinsames Thema' }));
  const topic = store.snapshot().topics[0];
  await createEntry(
    fields({
      personIds: ['lea', 'jonas'],
      kind: 'note',
      date: today,
      text: 'Geteilte Notiz',
      topicId: topic.id
    })
  );
  await saveContactRhythm('lea', fields({ operation: 'save', intervalDays: '28' }));
  const before = store.snapshot();
  const originalLea = before.people[0];
  const deletion = trash([originalLea]);
  const noConfirm = trash([originalLea]);
  noConfirm.delete('confirm');
  await assert.rejects(trashPeople(noConfirm), /bestätigen/);
  await assert.rejects(trashPeople(trash([])), /auswählen/);
  await assert.rejects(trashPeople(trash([originalLea, person('missing')])), /nicht gefunden/);
  const stale = trash([originalLea]);
  stale.set('version:lea', 'old');
  await assert.rejects(trashPeople(stale), /inzwischen/);
  assert.deepEqual(store.snapshot(), before);
  await trashPeople(deletion);
  const deleted = store.snapshot();
  const lea = deleted.people[0];
  assert(lea.deletedAt && lea.deletedAt === lea.updatedAt);
  const { deletedAt, updatedAt, ...rest } = lea;
  const { updatedAt: _, ...originalRest } = originalLea;
  assert.deepEqual(rest, originalRest);
  assert.deepEqual(deleted.people[1], before.people[1]);
  for (const key of ['topics', 'entries', 'reminders', 'relationships'] as const)
    assert.deepEqual(deleted[key], before[key]);
  await assert.rejects(trashPeople(deletion), /Papierkorb/);
  assert.throws(() => personFromForm(fields({ name: 'Resurrect' }), lea), /Papierkorb/);
  await assert.rejects(
    createEntry(fields({ personIds: ['lea'], kind: 'note', date: today, text: 'stale' })),
    /Person/
  );
  await assert.rejects(
    createReminder(fields({ personIds: ['lea'], title: 'stale', date: today, recurrence: 'once' })),
    /Person/
  );
  await assert.rejects(saveTopic('lea', fields({ operation: 'save', title: 'stale' })), /Person/);
  await assert.rejects(saveContactRhythm('lea', fields({ operation: 'resume' })), /Person/);
  await assert.rejects(
    changeReminder(fields({ id: deleted.reminders[0].id, operation: 'resume' })),
    /Papierkorb/
  );
  const entry = deleted.entries[0];
  await assert.rejects(
    deleteEntry('lea', fields({ id: entry.id, version: entry.createdAt, confirm: 'on' })),
    /Person/
  );
  await assert.rejects(updateEntry('lea', fields({ id: entry.id })), /Person/);
  await updateEntry(
    'jonas',
    fields({
      id: entry.id,
      version: entry.createdAt,
      personIds: ['jonas'],
      kind: 'note',
      date: today,
      text: 'Über Jonas korrigiert',
      topicId: ''
    })
  );
  const shared = store.snapshot().entries[0];
  assert.deepEqual(new Set(shared.personIds), new Set(['lea', 'jonas']));
  assert.equal(shared.topicId, topic.id);
  const expected = store.snapshot();
  const restarted = new JsonStore(store.directory);
  await restarted.load();
  assert.deepEqual(restarted.snapshot(), expected);
  const parsed = readBackup(await createBackup(store));
  assert.equal(parsed.data.people[0].deletedAt, deletedAt);
  assert.equal(parsed.photos!.size, 1);
  const restored = new JsonStore(await temporaryDirectory(t));
  await restored.load();
  await restored.restore(parsed.data, parsed.photos!);
  assert.deepEqual(restored.snapshot(), expected);
  assert.deepEqual(await restored.photos.read(lea.photoId!), photo);
  await store.import(JSON.parse(JSON.stringify(expected)));
  assert.deepEqual(store.snapshot(), expected);
  await assert.rejects(restorePerson(fields({ id: 'lea', version: 'old' })), /inzwischen/);
  await restorePerson(restore(lea));
  assert(!Object.hasOwn(store.snapshot().people[0], 'deletedAt'));
  assert.equal(activeDatabase(store.snapshot()).relationships.length, 1);
  assert.equal(activeDatabase(store.snapshot()).topics.length, 1);
  assert.equal(activeDatabase(store.snapshot()).reminders.length, before.reminders.length);
  await assert.rejects(trashPeople(deletion), /inzwischen/);
  await assert.rejects(restorePerson(restore(lea)), /nicht im Papierkorb/);
  await trashPeople(trash(store.snapshot().people));
  assert.equal(activeDatabase(store.snapshot()).people.length, 0);
  assert.equal(store.snapshot().people.length, 2);
  await store.import(fixture());
  assert(store.snapshot().people.every((p) => !Object.hasOwn(p, 'deletedAt')));
});
