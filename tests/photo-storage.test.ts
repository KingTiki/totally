import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, unlink, stat, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { JsonStore, type StoreOptions } from '../src/lib/server/store.ts';
import { createBackup, readBackup } from '../src/lib/server/backup.ts';
import { photoHash, validPhotoBytes } from '../src/lib/server/photo-files.ts';
import { personFromForm } from '../src/lib/server/actions.ts';
import { photoSource } from '../src/lib/photo.ts';
import { BACKUP_JSON_MAX_BYTES } from '../src/lib/backup.ts';
import { fixture, temporaryDirectory } from './helpers.ts';

const bytes = await readFile(new URL('./fixtures/profile.jpg', import.meta.url));
const inline = `data:image/jpeg;base64,${bytes.toString('base64')}`;
const id = photoHash(bytes);
const variant = Buffer.from(bytes);
variant[12] ^= 1;
assert(validPhotoBytes(variant));
const secondId = photoHash(variant);
const legacy = () => {
  const db = fixture();
  db.people[0].photo = inline;
  return db;
};

test('startup migrates legacy images atomically, deduplicates files and retains an original backup', async (t) => {
  const directory = await temporaryDirectory(t),
    raw = JSON.stringify(legacy(), null, 2);
  await writeFile(join(directory, 'data.json'), raw);
  const store = new JsonStore(directory);
  await store.load();
  assert.equal(store.snapshot().people[0].photoId, id);
  assert.equal(store.snapshot().people[0].photo, undefined);
  assert.equal(JSON.stringify(store.snapshot()).includes('base64'), false);
  assert.deepEqual(await readFile(join(directory, 'photos', `${id}.jpg`)), bytes);
  const backups = await readdir(join(directory, 'backups'));
  assert.equal(await readFile(join(directory, 'backups', backups[0]), 'utf8'), raw);
  await store.update((db) => {
    db.people[1].photo = inline;
  });
  assert.deepEqual(await readdir(join(directory, 'photos')), [`${id}.jpg`]);
  const modified = (await stat(join(directory, 'photos', `${id}.jpg`))).mtimeMs;
  await store.update((db) => {
    db.people[0].notes = 'Nur Text geändert';
  });
  assert.equal((await stat(join(directory, 'photos', `${id}.jpg`))).mtimeMs, modified);
  assert.equal(store.snapshot().people[1].photoId, id);
  const reload = new JsonStore(directory);
  await reload.load();
  assert.deepEqual(reload.snapshot(), store.snapshot());
  const form = new FormData();
  form.set('name', 'Lea');
  form.set('photo', photoSource(store.snapshot().people[0])!);
  assert.equal(personFromForm(form, store.snapshot().people[0]).photoId, id);
  form.set('photo', '/photos/' + '0'.repeat(64));
  await assert.rejects(
    store.update((db) => {
      db.people[0] = personFromForm(form, db.people[0]);
    }),
    /Profilfoto/
  );
});

test('photos referenced by any retained backup survive replacement, rotation removes only unreferenced files', async (t) => {
  const directory = await temporaryDirectory(t),
    store = new JsonStore(directory);
  await store.load();
  await store.import(legacy());
  await store.update((db) => {
    delete db.people[0].photoId;
    db.people[0].photo = `data:image/jpeg;base64,${variant.toString('base64')}`;
  });
  assert.deepEqual(
    (await readdir(join(directory, 'photos'))).sort(),
    [`${id}.jpg`, `${secondId}.jpg`].sort()
  );
  const backups = await readdir(join(directory, 'backups'));
  const previous = (
    await Promise.all(
      backups.map(async (file) =>
        JSON.parse(await readFile(join(directory, 'backups', file), 'utf8'))
      )
    )
  ).find((db) => db.people[0]?.photoId === id);
  assert(previous);
  await store.import(previous);
  assert.deepEqual(await store.photos.read(id), bytes);
  await store.update((db) => {
    delete db.people[0].photoId;
  });
  for (let i = 0; i < 11; i++)
    await store.update((db) => {
      db.people[0].notes = String(i);
    });
  assert.deepEqual(await readdir(join(directory, 'photos')), []);
  assert.equal((await readdir(join(directory, 'backups'))).length, 10);
});

test('a damaged backup prevents photo cleanup and missing or corrupt current photos never silently load', async (t) => {
  const directory = await temporaryDirectory(t),
    store = new JsonStore(directory);
  await store.load();
  await store.import(legacy());
  await store.photos.put(variant);
  await writeFile(join(directory, 'backups', 'zz-corrupt.json'), '{broken');
  t.mock.method(console, 'error', () => {});
  await store.update((db) => {
    db.people[0].notes = 'Speichern funktioniert weiterhin';
  });
  assert.deepEqual(await store.photos.read(secondId), variant);
  const raw = await readFile(join(directory, 'data.json'), 'utf8');
  await unlink(join(directory, 'photos', `${id}.jpg`));
  await assert.rejects(new JsonStore(directory).load(), /fehlt oder ist beschädigt/);
  assert.equal(await readFile(join(directory, 'data.json'), 'utf8'), raw);
  await writeFile(join(directory, 'photos', `${id}.jpg`), variant);
  await assert.rejects(new JsonStore(directory).load(), /fehlt oder ist beschädigt/);
  assert.equal(await readFile(join(directory, 'data.json'), 'utf8'), raw);
});

test('failed JSON commits and failed migration never leave live references to missing images', async (t) => {
  const directory = await temporaryDirectory(t);
  let fail = false;
  const options: StoreOptions = {
    rename: async (from, to) => {
      if (fail && to === join(directory, 'data.json')) throw new Error('Simulierter Schreibfehler');
      await rename(from, to);
    }
  };
  const store = new JsonStore(directory, options);
  await store.load();
  const before = store.snapshot();
  fail = true;
  await assert.rejects(store.import(legacy()), /Schreibfehler/);
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'data.json'), 'utf8')), before);
  fail = false;
  await store.import(legacy());
  assert.deepEqual(await store.photos.read(id), bytes);
  const migratingDirectory = await temporaryDirectory(t);
  const raw = JSON.stringify(legacy());
  await writeFile(join(migratingDirectory, 'data.json'), raw);
  const migrating = new JsonStore(migratingDirectory, {
    rename: async (from, to) => {
      if (to === join(migratingDirectory, 'data.json')) throw new Error('Migration abgebrochen');
      await rename(from, to);
    }
  });
  await assert.rejects(migrating.load(), /Migration abgebrochen/);
  assert.equal(await readFile(join(migratingDirectory, 'data.json'), 'utf8'), raw);
  await new JsonStore(migratingDirectory).load();
});

test('complete ZIP exports restore photos into an empty installation and old JSON still migrates', async (t) => {
  const store = new JsonStore(await temporaryDirectory(t));
  await store.load();
  await store.import(legacy());
  const archive = await createBackup(store);
  const parsed = readBackup(archive);
  assert.equal(parsed.data.people[0].photoId, id);
  assert.equal(parsed.data.people[0].photo, undefined);
  assert.deepEqual(Buffer.from(parsed.photos!.get(id)!), bytes);
  const target = new JsonStore(await temporaryDirectory(t));
  await target.load();
  await target.restore(parsed.data, parsed.photos!);
  assert.deepEqual(target.snapshot(), store.snapshot());
  assert.deepEqual(await target.photos.read(id), bytes);
  const old = readBackup(strToU8(JSON.stringify(legacy())));
  assert.equal(old.photos, undefined);
  await target.import(old.data);
  assert.equal(target.snapshot().people[0].photoId, id);
  const before = target.snapshot();
  await assert.rejects(target.restore(parsed.data, new Map()), /nicht alle/);
  await assert.rejects(target.restore(parsed.data, new Map([[id, variant]])), /ungültig/);
  assert.deepEqual(target.snapshot(), before);
});

test('ZIP import rejects traversal, extra files, missing and corrupt photos, bad checksums, duplicates and oversized entries', () => {
  const metadata = {
    ...legacy(),
    people: [{ ...fixture().people[0], photoId: id }, fixture().people[1]]
  };
  const validFiles = {
    'data.json': strToU8(JSON.stringify(metadata)),
    [`photos/${id}.jpg`]: bytes
  };
  for (const files of [
    { 'data.json': validFiles['data.json'] },
    { ...validFiles, '../outside.jpg': bytes },
    { ...validFiles, 'photos/../outside.jpg': bytes },
    { ...validFiles, '/absolute.jpg': bytes },
    { ...validFiles, [`photos/${secondId}.jpg`]: variant },
    { ...validFiles, [`photos/${id}.jpg`]: variant },
    { ...validFiles, [`photos/${id}.jpg`]: Buffer.from('<svg />') }
  ])
    assert.throws(() => readBackup(zipSync(files)), /ZIP/);
  const corrupted = Buffer.from(zipSync(validFiles, { level: 0 }));
  const start = 30 + corrupted.readUInt16LE(26) + corrupted.readUInt16LE(28);
  corrupted[start + validFiles['data.json'].length - 1] ^= 1;
  assert.throws(() => readBackup(corrupted), /Prüfsumme/);
  const duplicates = Buffer.from(
    zipSync({ ...validFiles, 'data.jsoX': validFiles['data.json'] }, { level: 0 })
  );
  for (let at = duplicates.indexOf('data.jsoX'); at !== -1; at = duplicates.indexOf('data.jsoX'))
    duplicates.write('data.json', at);
  assert.throws(() => readBackup(duplicates), /doppelte/);
  const oversized = Buffer.from(zipSync(validFiles));
  const end = oversized.length - 22,
    central = oversized.readUInt32LE(end + 16);
  oversized.writeUInt32LE(BACKUP_JSON_MAX_BYTES + 1, central + 24);
  assert.throws(() => readBackup(oversized), /zu groß/);
  const symlink = zipSync({
    'data.json': [validFiles['data.json'], { os: 3, attrs: 0o120777 << 16 }]
  });
  assert.throws(() => readBackup(symlink), /Symbolische Links/);
  const zip = zipSync(validFiles);
  for (const length of [1, 10, 21, 50, zip.length - 1])
    assert.throws(() => readBackup(zip.slice(0, length)));
});

test('ZIP export holds a snapshot while competing writes and photo cleanup wait', async (t) => {
  const store = new JsonStore(await temporaryDirectory(t));
  await store.load();
  await store.import(legacy());
  let reached!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => (reached = resolve)),
    gate = new Promise<void>((resolve) => (release = resolve));
  const original = store.photos.read.bind(store.photos);
  t.mock.method(store.photos, 'read', async (photoId: string) => {
    reached();
    await gate;
    return original(photoId);
  });
  const exporting = createBackup(store);
  await entered;
  let changed = false;
  const deleting = store.update((db) => {
    changed = true;
    delete db.people[0].photoId;
  });
  await Promise.resolve();
  assert.equal(changed, false);
  release();
  const archive = await exporting;
  await deleting;
  assert.equal(readBackup(archive).data.people[0].photoId, id);
  assert.deepEqual(Buffer.from(readBackup(archive).photos!.get(id)!), bytes);
});
