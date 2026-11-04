import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressLines, googleMapsUrl } from '../src/lib/address.ts';
import { personFromForm } from '../src/lib/server/actions.ts';
import { validateDatabase } from '../src/lib/server/validation.ts';
import { JsonStore } from '../src/lib/server/store.ts';
import { fixture, person, temporaryDirectory } from './helpers.ts';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
const address = {
  street: 'Mühlenstraße',
  houseNumber: '12 a',
  postalCode: '01219',
  location: 'Dresden'
};

test('address fields retain postal-code zeroes and house suffixes, preserve omitted fields and allow clearing', () => {
  const saved = personFromForm(form({ name: 'Lea', ...address, street: '  Mühlenstraße  ' }));
  assert.deepEqual(addressLines(saved), ['Mühlenstraße 12 a', '01219 Dresden']);
  const edited = personFromForm(form({ name: 'Lea', location: 'Dresden' }), saved);
  assert.deepEqual(addressLines(edited), addressLines(saved));
  const cleared = personFromForm(
    form({ name: 'Lea', street: '', houseNumber: '', postalCode: '', location: '' }),
    saved
  );
  assert.equal(googleMapsUrl(cleared), undefined);
  for (const [key, max] of [
    ['street', 500],
    ['houseNumber', 50],
    ['postalCode', 20]
  ] as const)
    assert.throws(
      () => personFromForm(form({ name: 'Lea', [key]: 'x'.repeat(max + 1) })),
      /maximal/
    );
});

test('address validation accepts old profiles and rejects malformed new fields', () => {
  assert.doesNotThrow(() => validateDatabase(fixture()));
  const db = fixture();
  Object.assign(db.people[0], address);
  assert.deepEqual(validateDatabase(db).people[0], db.people[0]);
  for (const [key, max] of [
    ['street', 500],
    ['houseNumber', 50],
    ['postalCode', 20]
  ] as const) {
    for (const value of [null, 123, {}, 'x'.repeat(max + 1)]) {
      const invalid = structuredClone(db);
      Object.assign(invalid.people[0], { [key]: value });
      assert.throws(() => validateDatabase(invalid), new RegExp(key));
    }
  }
});

test('address links encode special characters safely and support partial or missing addresses', () => {
  const url = new URL(googleMapsUrl({ ...address, street: 'Mühlenstraße & Allee #2' })!);
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/search/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('query'), 'Mühlenstraße & Allee #2 12 a, 01219 Dresden');
  assert.equal(url.hash, '');
  assert.equal(url.searchParams.size, 2);
  assert.deepEqual(addressLines(person()), ['Hamburg']);
  assert.equal(new URL(googleMapsUrl(person())!).searchParams.get('query'), 'Hamburg');
  assert.deepEqual(
    addressLines({
      street: 'Downing Street',
      houseNumber: '10',
      postalCode: 'SW1A 2AA',
      location: 'London'
    }),
    ['Downing Street 10', 'SW1A 2AA London']
  );
  assert.deepEqual(addressLines({ location: '' }), []);
  assert.equal(googleMapsUrl({ location: '' }), undefined);
});

test('old and new addresses survive disk reload and JSON export/import without changing schema version', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = new JsonStore(directory);
  await store.load();
  await store.import(fixture());
  await store.update((db) => Object.assign(db.people[0], address));
  const exported = JSON.parse(JSON.stringify(store.snapshot()));
  assert.equal(exported.schemaVersion, 1);
  await store.import(exported);
  const restarted = new JsonStore(directory);
  await restarted.load();
  assert.deepEqual(restarted.snapshot(), exported);
  assert.deepEqual(addressLines(restarted.snapshot().people[0]), [
    'Mühlenstraße 12 a',
    '01219 Dresden'
  ]);
  assert.deepEqual(addressLines(restarted.snapshot().people[1]), ['Hamburg']);
});
