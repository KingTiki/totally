import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validPhoto } from '../src/lib/server/photo.ts';
import { PHOTO_MAX_BYTES, initialCrop, cropArea, clampCrop } from '../src/lib/photo.ts';
import { personFromForm } from '../src/lib/server/actions.ts';
import { JsonStore } from '../src/lib/server/store.ts';
import { fixture, person, temporaryDirectory } from './helpers.ts';

const bytes = await readFile(new URL('./fixtures/profile.jpg', import.meta.url));
const photo = `data:image/jpeg;base64,${bytes.toString('base64')}`;
function form(fields: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(fields)) result.set(key, value);
  return result;
}

test('crop geometry stays inside landscape, portrait and square images at every zoom and edge', () => {
  assert.deepEqual(cropArea(1000, 500, initialCrop()), { x: 250, y: 0, size: 500 });
  assert.deepEqual(cropArea(500, 1000, initialCrop()), { x: 0, y: 250, size: 500 });
  assert.deepEqual(cropArea(1000, 500, { x: 1, y: 0, zoom: 2 }), { x: 750, y: 0, size: 250 });
  for (const [width, height] of [
    [1000, 500],
    [500, 1000],
    [384, 384]
  ]) {
    for (const zoom of [-1, 1, 1.35, 2, 3, 100, NaN]) {
      for (const x of [-5, 0, 0.5, 1, 5, Infinity]) {
        const area = cropArea(width, height, { x, y: x, zoom });
        assert(area.x >= -1e-8 && area.y >= -1e-8);
        assert(area.x + area.size <= width + 1e-8 && area.y + area.size <= height + 1e-8);
      }
    }
  }
  assert.equal(clampCrop(500, 500, { x: NaN, y: NaN, zoom: NaN }).zoom, 1);
  assert.throws(() => cropArea(0, 500, initialCrop()), /Größe/);
});

test('profile photos accept bounded JPEGs and reject active formats, remote URLs and damaged images', () => {
  assert.equal(validPhoto(photo), true);
  for (const input of [
    undefined,
    '',
    'https://example.org/photo.jpg',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    photo.replace('image/jpeg', 'image/png'),
    `data:image/jpeg;base64,${Buffer.alloc(PHOTO_MAX_BYTES + 1).toString('base64')}`,
    photo.slice(0, -8),
    'data:image/jpeg;base64,////'
  ])
    assert.equal(validPhoto(input), false);
  const oversized = Buffer.from(bytes);
  const frame = oversized.indexOf(Buffer.from([0xff, 0xc0]));
  assert(frame > 0);
  oversized.writeUInt16BE(4000, frame + 5);
  assert.equal(validPhoto(`data:image/jpeg;base64,${oversized.toString('base64')}`), false);
  for (let end = 0; end < bytes.length; end += 31) {
    const truncated = Buffer.concat([bytes.subarray(0, end), Buffer.from([0xff, 0xd9])]);
    assert.doesNotThrow(() => validPhoto(`data:image/jpeg;base64,${truncated.toString('base64')}`));
  }
});

test('profile edits preserve an omitted photo and allow replacing or explicitly removing it', () => {
  const existing = { ...person(), photo };
  assert.equal(personFromForm(form({ name: 'Lea' }), existing).photo, photo);
  assert.equal(personFromForm(form({ name: 'Lea', photo })).photo, photo);
  assert.equal(personFromForm(form({ name: 'Lea', photo: '' }), existing).photo, undefined);
});

test('photos survive JSON export, import, disk restart and recovery backups; old profiles remain valid', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = new JsonStore(directory);
  await store.load();
  await store.import(fixture());
  await store.update((db) => {
    db.people[0].photo = photo;
  });
  const exported = JSON.parse(JSON.stringify(store.snapshot()));
  await store.import(exported);
  const restarted = new JsonStore(directory);
  await restarted.load();
  assert.deepEqual(restarted.snapshot(), exported);
  await assert.rejects(
    restarted.update((db) => {
      db.people[0].photo = 'data:image/svg+xml,<svg />';
    }),
    /Profilfoto/
  );
  const photoId = exported.people[0].photoId;
  assert.match(photoId, /^[a-f0-9]{64}$/);
  assert.equal(restarted.snapshot().people[0].photo, undefined);
  assert.deepEqual(await restarted.photos.read(photoId), bytes);
  await restarted.update((db) => {
    delete db.people[0].photoId;
  });
  const { readdir } = await import('node:fs/promises');
  const backups = await readdir(join(directory, 'backups'));
  assert(
    (
      await Promise.all(
        backups.map(async (file) =>
          JSON.parse(await readFile(join(directory, 'backups', file), 'utf8'))
        )
      )
    ).some((db) => db.people[0]?.photoId === photoId)
  );
});
