import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTags } from '../src/lib/tags.ts';
import { personFromForm } from '../src/lib/server/actions.ts';
import { validateDatabase } from '../src/lib/server/validation.ts';
import { fixture } from './helpers.ts';

test('tags reuse existing spelling, trim and deduplicate case and equivalent Unicode', () => {
  assert.deepEqual(
    normalizeTags(
      [' freunde ', 'Freunde', 'SPORT', '', 'Cafe\u0301', 'Café', 'Neu'],
      ['Freunde', 'Sport', 'Café']
    ),
    ['Freunde', 'Sport', 'Café', 'Neu']
  );
  assert.deepEqual(normalizeTags(['sport', 'Sport', 'SPort']), ['sport']);
});

test('profile form normalizes against all people and keeps data limits enforced', () => {
  const form = new FormData();
  form.set('name', 'Neue Person');
  form.set('tags', 'freunde, FREUNDE, sport, Neues');
  const db = fixture();
  db.people[1].tags.push('Sport');
  db.people.push(
    personFromForm(
      form,
      undefined,
      db.people.flatMap((p) => p.tags)
    )
  );
  assert.deepEqual(validateDatabase(db).people.at(-1)!.tags, ['Freunde', 'Sport', 'Neues']);
  form.set('tags', 'x'.repeat(61));
  db.people[2] = personFromForm(form);
  assert.throws(() => validateDatabase(db), /Tags/);
  form.set('tags', Array.from({ length: 31 }, (_, i) => `Tag ${i}`).join(','));
  db.people[2] = personFromForm(form);
  assert.throws(() => validateDatabase(db), /Tags/);
});
