import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { fixture, temporaryDirectory } from './helpers.ts';
import { runtime } from '../src/lib/server/runtime.ts';
import {
  createEntry,
  createReminder,
  changeReminder,
  saveContactRhythm
} from '../src/lib/server/actions.ts';
import { contactRhythms, rhythmLabel } from '../src/lib/contact-rhythm.ts';
import { agenda } from '../src/lib/agenda.ts';
import { addDays, localClock } from '../src/lib/dates.ts';

function form(values: Record<string, string | string[]>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values))
    for (const item of Array.isArray(value) ? value : [value]) result.append(key, item);
  return result;
}

test('personal rhythm preserves its cycle, reacts only to contacts, pauses, switches off and avoids duplicates', async (t) => {
  process.env.DATA_DIR = await temporaryDirectory(t);
  const salt = '0123456789abcdef0123456789abcdef';
  process.env.PASSWORD_HASH = `scrypt:${salt}:${scryptSync('tests-only', salt, 64).toString('hex')}`;
  process.env.SESSION_SECRET = 'contact-rhythm-tests-only-'.repeat(3);
  process.env.ORIGIN = 'http://localhost:3000';
  const { store } = await runtime();
  await store.import(fixture());
  const today = localClock(new Date(), 'Europe/Berlin').date;
  const rhythm = (id = 'lea') => contactRhythms(store.snapshot(), id)[0];
  await createEntry(
    form({ personIds: 'lea', kind: 'contact', date: addDays(today, -20), text: 'Gesprochen' })
  );
  await saveContactRhythm('lea', form({ operation: 'save', intervalDays: '28' }));
  await saveContactRhythm('jonas', form({ operation: 'save', intervalDays: '56' }));
  const originalId = rhythm().id;
  assert.equal(rhythm().date, addDays(today, 8));
  assert.equal(rhythm('jonas').date, addDays(today, 56));
  await saveContactRhythm('lea', form({ operation: 'save', intervalDays: '14' }));
  assert.equal(rhythm().date, addDays(today, -6));
  assert.equal(rhythm().id, originalId);
  await createEntry(
    form({ personIds: 'lea', kind: 'note', date: today, text: 'Eine reine Notiz' })
  );
  assert.equal(rhythm().date, addDays(today, -6));
  await createEntry(
    form({ personIds: 'lea', kind: 'contact', date: addDays(today, -2), text: '' })
  );
  assert.equal(rhythm().date, addDays(today, 12));
  await changeReminder(form({ id: originalId, operation: 'complete', occurrence: rhythm().date }));
  await saveContactRhythm('lea', form({ operation: 'save', intervalDays: '28' }));
  assert.equal(rhythm().date, addDays(today, 28), 'editing preserves the manual completion anchor');
  await saveContactRhythm('lea', form({ operation: 'pause' }));
  await createEntry(
    form({ personIds: ['lea', 'jonas'], kind: 'contact', date: today, text: 'Gemeinsamer Kontakt' })
  );
  assert.equal(rhythm().state, 'paused');
  assert.equal(rhythm().date, addDays(today, 28));
  assert.equal(rhythm('jonas').date, addDays(today, 56));
  assert(
    !agenda(store.snapshot(), today, addDays(today, 100)).some((item) => item.id === originalId)
  );
  await saveContactRhythm('lea', form({ operation: 'resume' }));
  assert(
    agenda(store.snapshot(), today, addDays(today, 100)).some((item) => item.id === originalId)
  );
  await changeReminder(
    form({
      id: originalId,
      operation: 'snooze',
      occurrence: rhythm().date,
      until: addDays(today, 35)
    })
  );
  await saveContactRhythm('lea', form({ operation: 'save', intervalDays: '28' }));
  assert.equal(rhythm().snooze?.date, addDays(today, 35));
  await saveContactRhythm('lea', form({ operation: 'save', intervalDays: '14' }));
  assert.equal(rhythm().snooze, undefined);
  assert.equal(rhythm().date, addDays(today, 14));
  await assert.rejects(
    createReminder(
      form({ personIds: 'lea', recurrence: 'interval', intervalDays: '7', title: 'Doppelt' })
    ),
    /bereits/
  );
  for (const intervalDays of ['0', '-1', '1.5', '3651', '']) {
    const before = store.snapshot();
    await assert.rejects(
      saveContactRhythm('lea', form({ operation: 'save', intervalDays })),
      /Abstand/
    );
    assert.deepEqual(store.snapshot(), before);
  }
  await assert.rejects(
    saveContactRhythm('missing', form({ operation: 'save', intervalDays: '7' })),
    /Person/
  );
  await saveContactRhythm('lea', form({ operation: 'off' }));
  assert.equal(rhythm(), undefined);
  assert.equal(store.snapshot().reminders.find((item) => item.id === originalId)!.state, 'done');
  await Promise.all([
    saveContactRhythm('lea', form({ operation: 'save', intervalDays: '7' })),
    saveContactRhythm('lea', form({ operation: 'save', intervalDays: '14' }))
  ]);
  assert.equal(contactRhythms(store.snapshot(), 'lea').length, 1);
  assert.equal(rhythm().intervalDays, 14);
  await store.update((db) => {
    db.reminders.push({
      ...structuredClone(rhythm()),
      id: 'legacy-interval',
      title: 'Bisheriger zweiter Rhythmus'
    });
  });
  assert.equal(contactRhythms(store.snapshot(), 'lea').length, 2);
  await saveContactRhythm('lea', form({ operation: 'save', intervalDays: '28' }));
  assert.equal(contactRhythms(store.snapshot(), 'lea').length, 1);
  assert.equal(
    store
      .snapshot()
      .reminders.filter((item) => item.recurrence === 'interval' && item.personIds.includes('lea'))
      .length,
    3
  );
  assert.equal(rhythm('jonas').intervalDays, 56);
  assert.equal(rhythmLabel(1), 'Jeden Tag');
  assert.equal(rhythmLabel(7), 'Jede Woche');
  assert.equal(rhythmLabel(28), 'Alle 4 Wochen');
  assert.equal(rhythmLabel(10), 'Alle 10 Tage');
});
