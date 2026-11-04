import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { JsonStore } from '../src/lib/server/store.ts';
import { validateDatabase } from '../src/lib/server/validation.ts';
import { fixture, person, temporaryDirectory } from './helpers.ts';

test('serializes concurrent writes without lost updates and retains ten valid backups', async (t) => {
  const directory = await temporaryDirectory(t),
    store = new JsonStore(directory);
  await store.load();
  await Promise.all(
    Array.from({ length: 24 }, (_, i) =>
      store.update((db) => {
        db.people.push(person(`person-${i}`));
      })
    )
  );
  assert.equal(store.snapshot().people.length, 24);
  const raw = await readFile(join(directory, 'data.json'), 'utf8');
  assert.match(raw, /\n  "schemaVersion"/);
  assert.deepEqual(validateDatabase(JSON.parse(raw)), store.snapshot());
  const files = await readdir(join(directory, 'backups'));
  assert.equal(files.length, 10);
  for (const file of files)
    validateDatabase(JSON.parse(await readFile(join(directory, 'backups', file), 'utf8')));
  const reloaded = new JsonStore(directory);
  await reloaded.load();
  assert.deepEqual(reloaded.snapshot(), store.snapshot());
});
test('write failure leaves disk and memory unchanged and the queue can recover', async (t) => {
  const directory = await temporaryDirectory(t);
  let fail = false;
  const store = new JsonStore(directory, {
    rename: async (from, to) => {
      if (fail && to === join(directory, 'data.json'))
        throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
      await rename(from, to);
    }
  });
  await store.load();
  const before = store.snapshot();
  fail = true;
  await assert.rejects(
    store.update((db) => {
      db.people.push(person());
    }),
    /Disk full/
  );
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'data.json'), 'utf8')), before);
  assert.equal((await readdir(directory)).filter((f) => f.endsWith('.tmp')).length, 0);
  fail = false;
  await store.update((db) => {
    db.people.push(person());
  });
  assert.equal(store.snapshot().people.length, 1);
});
test('a post-rename sync failure stops access to stale memory until restart', async (t) => {
  const directory = await temporaryDirectory(t);
  let fail = false;
  const synced: string[] = [];
  const store = new JsonStore(directory, {
    syncDirectory: async (path) => {
      synced.push(path);
      if (fail && path === directory) throw new Error('I/O error');
    }
  });
  await store.load();
  fail = true;
  await assert.rejects(
    store.update((db) => {
      db.people.push(person());
    }),
    /Synchronisierung/
  );
  assert.throws(() => store.snapshot(), /neu starten/);
  await assert.rejects(
    store.update((db) => {
      db.people = [];
    }),
    /neu starten/
  );
  assert(synced.includes(join(directory, 'backups')));
  const reloaded = new JsonStore(directory);
  await reloaded.load();
  assert.equal(reloaded.snapshot().people.length, 1);
});
test('validation and callback failures do not mutate persisted state', async (t) => {
  const directory = await temporaryDirectory(t),
    store = new JsonStore(directory);
  await store.load();
  await assert.rejects(
    store.update((db) => {
      db.people.push(person());
      throw new Error('cancel');
    }),
    /cancel/
  );
  await assert.rejects(
    store.update((db) => {
      db.relationships.push({ id: 'bad', fromId: 'missing', toId: 'also-missing', label: 'kennt' });
    }),
    /Beziehung/
  );
  assert.equal(store.snapshot().people.length, 0);
  assert.equal(store.snapshot().relationships.length, 0);
});
test('corrupt or missing data with backups never silently becomes an empty database', async (t) => {
  const directory = await temporaryDirectory(t),
    path = join(directory, 'data.json');
  const store = new JsonStore(directory);
  await store.load();
  await store.import(fixture());
  await writeFile(path, '{ broken');
  await assert.rejects(new JsonStore(directory).load(), /bleibt unverändert/);
  assert.equal(await readFile(path, 'utf8'), '{ broken');
  await unlink(path);
  await assert.rejects(new JsonStore(directory).load(), /wiederherstellen/);
});
test('round-trip import preserves all entities and makes a recovery backup', async (t) => {
  const directory = await temporaryDirectory(t),
    store = new JsonStore(directory);
  await store.load();
  const db = fixture();
  db.entries.push({
    id: 'entry',
    personIds: ['lea', 'jonas'],
    kind: 'contact',
    contactType: 'Getroffen',
    text: 'Kaffee getrunken',
    date: '2026-10-20',
    createdAt: '2026-10-20T12:00:00.000Z'
  });
  await store.import(JSON.parse(JSON.stringify(db)));
  assert.deepEqual(store.snapshot(), db);
  const exported = JSON.parse(JSON.stringify(store.snapshot()));
  exported.people[0].name = 'Lea Neu';
  await store.import(exported);
  const backups = await readdir(join(directory, 'backups'));
  const restored = await Promise.all(
    backups.map(async (f) => JSON.parse(await readFile(join(directory, 'backups', f), 'utf8')))
  );
  assert(restored.some((d) => d.people[0]?.name === 'Lea Müller'));
  assert.equal(store.snapshot().relationships.length, 1);
  assert.equal(store.snapshot().entries[0].personIds.length, 2);
  const invalid = structuredClone(exported);
  invalid.schemaVersion = 999;
  await assert.rejects(store.import(invalid), /Dateiversion/);
  assert.equal(store.snapshot().people[0].name, 'Lea Neu');
});
