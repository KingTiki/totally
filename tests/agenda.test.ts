import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agenda, lastContact } from '../src/lib/agenda.ts';
import { addDays, annualDate, isDate, localClock } from '../src/lib/dates.ts';
import { validateDatabase } from '../src/lib/server/validation.ts';
import { fixture, reminder } from './helpers.ts';

test('birthdays without a year and February 29 follow the documented calendar policy', () => {
  const db = fixture();
  db.reminders = [];
  db.people[0].birthday = { month: 2, day: 29 };
  const ordinary = agenda(db, '2027-02-01', '2027-03-01');
  assert.equal(ordinary[0].date, '2027-02-28');
  assert.equal(ordinary[0].detail, 'Geburtstag');
  db.people[0].birthday.year = 2000;
  const leap = agenda(db, '2028-02-01', '2028-03-01');
  assert.equal(leap[0].date, '2028-02-29');
  assert.equal(leap[0].detail, 'Wird 28');
  assert.equal(annualDate(2, 29, 2100), '2100-02-28');
  assert.equal(annualDate(2, 29, 2000), '2000-02-29');
});
test('annual completion, pause, overdue reminders and snoozing across years', () => {
  const db = fixture();
  db.reminders = [
    reminder({
      recurrence: 'annual',
      date: '2026-12-20',
      snooze: { occurrence: '2026-12-20', date: '2027-01-04' }
    })
  ];
  const january = agenda(db, '2027-01-01', '2027-01-31');
  assert.equal(january.length, 1);
  assert.equal(january[0].occurrence, '2026-12-20');
  db.reminders[0].completed.push('2026-12-20');
  assert.equal(agenda(db, '2027-01-01', '2027-01-31').length, 0);
  assert.equal(agenda(db, '2027-12-01', '2027-12-31').length, 1);
  db.reminders[0].state = 'paused';
  assert.equal(agenda(db, '2027-12-01', '2027-12-31').length, 0);
  db.reminders = [reminder()];
  assert.equal(agenda(db, '2026-10-25', '2026-10-30').length, 0);
  assert.equal(agenda(db, '2026-10-25', '2026-10-30', true).length, 1);
});
test('calendar math stays stable over daylight saving changes and date rollover', () => {
  assert.deepEqual(localClock(new Date('2026-10-24T22:30:00Z'), 'Europe/Berlin'), {
    date: '2026-10-25',
    time: '00:30'
  });
  assert.equal(localClock(new Date('2026-10-25T01:30:00Z'), 'Europe/Berlin').time, '02:30');
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(isDate('2026-02-29'), false);
  assert.equal(isDate('2028-02-29'), true);
});
test('an unfinished annual event remains overdue across New Year without accumulating every past year', () => {
  const db = fixture();
  db.reminders = [reminder({ recurrence: 'annual', date: '2024-12-20' })];
  const items = agenda(db, '2027-01-01', '2027-01-31', true);
  assert.equal(items.length, 1);
  assert.equal(items[0].date, '2026-12-20');
  db.reminders[0].completed.push('2026-12-20');
  assert.equal(agenda(db, '2027-01-01', '2027-01-31', true).length, 0);
});
test('ordinary notes never count as contact', () => {
  const db = fixture();
  db.entries = [
    {
      id: 'contact',
      personIds: ['lea'],
      kind: 'contact',
      contactType: 'Telefoniert',
      text: '',
      date: '2026-09-01',
      createdAt: '2026-09-01T10:00:00Z'
    },
    {
      id: 'note',
      personIds: ['lea'],
      kind: 'note',
      contactType: '',
      text: 'Geschenkidee',
      date: '2026-10-24',
      createdAt: '2026-10-24T10:00:00Z'
    }
  ];
  assert.equal(lastContact(db, 'lea'), '2026-09-01');
  assert.equal(lastContact(db, 'jonas'), undefined);
});
test('import rejects duplicate IDs, dangling links, impossible birthdays and unknown fields', () => {
  const duplicate = fixture();
  duplicate.people[1].id = 'lea';
  assert.throws(() => validateDatabase(duplicate), /eindeutig/);
  const dangling = fixture();
  dangling.entries.push({
    id: 'e',
    personIds: ['missing'],
    kind: 'note',
    contactType: '',
    text: 'x',
    date: '2026-10-24',
    createdAt: '2026-10-24T10:00:00Z'
  });
  assert.throws(() => validateDatabase(dangling), /Personenverweis/);
  const birthday = fixture();
  birthday.people[0].birthday = { month: 2, day: 31 };
  assert.throws(() => validateDatabase(birthday), /Geburtstag/);
  assert.throws(
    () => validateDatabase({ ...fixture(), password: 'not-exportable' }),
    /Unbekannte Felder/
  );
});
