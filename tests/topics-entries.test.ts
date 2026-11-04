import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, temporaryDirectory } from './helpers.ts';
import { validateDatabase } from '../src/lib/server/validation.ts';
import { JsonStore } from '../src/lib/server/store.ts';
import { runtime } from '../src/lib/server/runtime.ts';
import {
  createEntry,
  updateEntry,
  saveTopic,
  saveContactRhythm,
  changeReminder
} from '../src/lib/server/actions.ts';
import { lastContact } from '../src/lib/agenda.ts';
import { addDays, localClock } from '../src/lib/dates.ts';
import type { Topic, Entry } from '../src/lib/model.ts';

const topic = (): Topic => ({
  id: 'moving',
  personId: 'lea',
  title: 'Wohnungssuche',
  description: 'Sucht im Norden.',
  state: 'active',
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z'
});
function fields(values: Record<string, string | string[]>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values))
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  return form;
}

test('topic validation accepts old exports and enforces topic owners, references, states and global IDs', () => {
  const old = fixture();
  const { topics: _, ...legacy } = old;
  assert.deepEqual(validateDatabase(legacy), old);
  const db = fixture();
  db.topics.push(topic());
  db.entries.push({
    id: 'entry',
    personIds: ['lea', 'jonas'],
    kind: 'note',
    contactType: 'Kontakt',
    text: 'Erste Besichtigung',
    date: '2026-01-02',
    createdAt: '2026-01-02T12:00:00.000Z',
    topicId: 'moving'
  });
  assert.deepEqual(validateDatabase(db), db);
  for (const modify of [
    (copy: typeof db) => {
      copy.topics[0].personId = 'missing';
    },
    (copy: typeof db) => {
      copy.topics[0].id = 'lea';
    },
    (copy: typeof db) => {
      copy.entries[0].topicId = 'missing';
    },
    (copy: typeof db) => {
      copy.entries[0].personIds = ['jonas'];
    },
    (copy: typeof db) => {
      copy.entries[0].updatedAt = 'not-a-date';
    }
  ]) {
    const copy = structuredClone(db);
    modify(copy);
    assert.throws(() => validateDatabase(copy), /Ungültige Daten/);
  }
  assert.throws(() => validateDatabase({ ...db, topics: null }), /Liste/);
  assert.throws(
    () => validateDatabase({ ...db, topics: [{ ...topic(), state: 'unknown' }] }),
    /Thema/
  );
});

test('old JSON loads without replacement and topic/history export survives import and restart', async (t) => {
  const directory = await temporaryDirectory(t),
    path = join(directory, 'data.json');
  const { topics: _, ...legacy } = fixture();
  const raw = JSON.stringify(legacy, null, 2);
  await writeFile(path, raw);
  const store = new JsonStore(directory);
  await store.load();
  assert.deepEqual(store.snapshot().topics, []);
  assert.equal(await readFile(path, 'utf8'), raw);
  await store.update((db) => {
    db.topics.push({ ...topic(), state: 'done' });
    db.entries.push({
      id: 'entry',
      personIds: ['lea', 'jonas'],
      kind: 'contact',
      contactType: 'Telefoniert',
      text: 'Wohnung gefunden',
      date: '2026-01-03',
      topicId: 'moving',
      createdAt: '2026-01-03T12:00:00.000Z',
      updatedAt: '2026-01-04T12:00:00.000Z'
    });
  });
  const exported = JSON.parse(JSON.stringify(store.snapshot()));
  await store.import(exported);
  const restarted = new JsonStore(directory);
  await restarted.load();
  assert.deepEqual(restarted.snapshot(), exported);
  const bad = structuredClone(exported);
  bad.entries[0].topicId = 'missing';
  await assert.rejects(store.import(bad), /Themenzuordnung/);
  assert.deepEqual(store.snapshot(), exported);
});

test('shared history editing preserves IDs, rejects stale changes and updates rhythms only when last contact changes', async (t) => {
  process.env.DATA_DIR = await temporaryDirectory(t);
  const salt = '0123456789abcdef0123456789abcdef';
  process.env.PASSWORD_HASH = `scrypt:${salt}:${scryptSync('tests-only', salt, 64).toString('hex')}`;
  process.env.SESSION_SECRET = 'topics-entries-tests-only-'.repeat(3);
  process.env.ORIGIN = 'http://localhost:3000';
  const { store } = await runtime();
  await store.import(fixture());
  const today = localClock(new Date(), 'Europe/Berlin').date;
  await saveContactRhythm('lea', fields({ operation: 'save', intervalDays: '28' }));
  await saveContactRhythm('jonas', fields({ operation: 'save', intervalDays: '56' }));
  const rhythm = (id: string) =>
    store
      .snapshot()
      .reminders.find((r) => r.recurrence === 'interval' && r.personIds.includes(id))!;
  await saveTopic(
    'lea',
    fields({ operation: 'save', title: 'Wohnungssuche', description: 'Im Norden' })
  );
  const currentTopic = () => store.snapshot().topics[0];
  const topicId = currentTopic().id;
  await createEntry(
    fields({
      personIds: ['lea', 'jonas'],
      kind: 'contact',
      date: addDays(today, -5),
      text: 'Gemeinsamer Kontakt'
    })
  );
  const contact = store.snapshot().entries.at(-1)!;
  await createEntry(
    fields({
      personIds: ['lea', 'jonas'],
      kind: 'note',
      date: today,
      text: 'Besichtigung geplant',
      topicId,
      followUp: addDays(today, 3),
      followUpTitle: 'Nachfragen'
    })
  );
  const note = store.snapshot().entries.at(-1)!;
  const followup = store.snapshot().reminders.find((r) => r.title === 'Nachfragen')!;
  function edit(entry: Entry, overrides: Record<string, string | string[]> = {}) {
    return fields({
      id: entry.id,
      version: entry.updatedAt || entry.createdAt,
      personIds: entry.personIds,
      kind: entry.kind,
      date: entry.date,
      text: entry.text,
      contactType: entry.contactType,
      topicId: entry.topicId || '',
      ...overrides
    });
  }
  await updateEntry(
    'jonas',
    edit(note, { text: 'Besichtigung am Freitag', date: addDays(today, -1) })
  );
  const edited = store.snapshot().entries.find((e) => e.id === note.id)!;
  assert.equal(edited.createdAt, note.createdAt);
  assert(edited.updatedAt);
  assert.equal(edited.topicId, topicId);
  assert.deepEqual(
    store.snapshot().reminders.find((r) => r.id === followup.id),
    followup
  );
  assert.equal(rhythm('lea').date, addDays(today, 23));
  const before = store.snapshot();
  await assert.rejects(updateEntry('lea', edit(note, { text: 'Veraltet' })), /inzwischen/);
  assert.deepEqual(store.snapshot(), before);
  await updateEntry('lea', edit(contact, { date: addDays(today, -10) }));
  assert.equal(rhythm('lea').date, addDays(today, 18));
  assert.equal(rhythm('jonas').date, addDays(today, 46));
  await saveContactRhythm('jonas', fields({ operation: 'pause' }));
  await updateEntry(
    'lea',
    edit(
      store.snapshot().entries.find((e) => e.id === contact.id)!,
      { kind: 'note', text: 'War nur eine Notiz' }
    )
  );
  assert.equal(lastContact(store.snapshot(), 'lea'), undefined);
  assert.equal(rhythm('lea').date, addDays(today, 28));
  assert.equal(rhythm('jonas').state, 'paused');
  assert.equal(rhythm('jonas').date, addDays(today, 56));
  await createEntry(
    fields({ personIds: 'lea', kind: 'contact', date: addDays(today, -2), text: 'Telefonat' })
  );
  let latest = store.snapshot().entries.at(-1)!;
  await changeReminder(
    fields({ id: rhythm('lea').id, operation: 'complete', occurrence: rhythm('lea').date })
  );
  await updateEntry('lea', edit(latest, { text: 'Telefonat korrigiert' }));
  assert.equal(
    rhythm('lea').date,
    addDays(today, 28),
    'text correction preserves manual cycle start'
  );
  latest = store.snapshot().entries.find((e) => e.id === latest.id)!;
  await updateEntry('lea', edit(latest, { personIds: ['jonas'] }));
  assert.equal(lastContact(store.snapshot(), 'lea'), undefined);
  assert.equal(lastContact(store.snapshot(), 'jonas'), addDays(today, -2));
  assert.equal(rhythm('jonas').date, addDays(today, 54));
  assert.equal(rhythm('jonas').state, 'paused');
  await assert.rejects(updateEntry('lea', edit(edited, { personIds: ['jonas'] })), /Themas/);
  await updateEntry('lea', edit(edited, { personIds: ['jonas'], topicId: '' }));
  assert.equal(store.snapshot().entries.find((e) => e.id === note.id)!.topicId, undefined);
  await createEntry(
    fields({ personIds: 'lea', kind: 'note', date: today, text: 'Erste Wohnung gefunden', topicId })
  );
  const linked = store.snapshot().entries.at(-1)!;
  await saveTopic('lea', fields({ id: topicId, operation: 'complete' }));
  await assert.rejects(
    createEntry(
      fields({ personIds: 'lea', kind: 'note', date: today, text: 'Geschlossen', topicId })
    ),
    /abgeschlossen/
  );
  await updateEntry('lea', edit(linked, { text: 'Korrektur am abgeschlossenen Thema' }));
  assert.equal(currentTopic().state, 'done');
  const oldVersion = currentTopic().updatedAt;
  await saveTopic('lea', fields({ id: topicId, operation: 'reopen' }));
  await assert.rejects(
    saveTopic(
      'lea',
      fields({ id: topicId, version: oldVersion, operation: 'save', title: 'Veraltet' })
    ),
    /inzwischen/
  );
  await saveTopic(
    'lea',
    fields({
      id: topicId,
      version: currentTopic().updatedAt,
      operation: 'save',
      title: 'Umzug',
      description: 'Neue Wohnung gefunden'
    })
  );
  assert.equal(currentTopic().id, topicId);
  assert.equal(currentTopic().title, 'Umzug');
  await assert.rejects(
    saveTopic('jonas', fields({ id: topicId, operation: 'complete' })),
    /nicht gefunden/
  );
  const unchanged = store.snapshot();
  await assert.rejects(
    updateEntry(
      'lea',
      edit(
        store.snapshot().entries.find((e) => e.id === linked.id)!,
        { date: addDays(today, 1) }
      )
    ),
    /Zukunft/
  );
  assert.deepEqual(store.snapshot(), unchanged);
});
