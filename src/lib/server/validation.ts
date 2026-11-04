import { t } from './language.ts';
import type { Database } from '../model.ts';
import { isDate, validTimezone } from '../dates.ts';
import { validPhoto } from './photo.ts';
import { PHOTO_ID_PATTERN } from '../photo.ts';

function ensure(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(t('Ungültige Daten: {p0}', { p0: message }));
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  ensure(value && typeof value === 'object' && !Array.isArray(value), t('Objekt erwartet.'));
  const result = value as Record<string, unknown>;
  ensure(
    Object.keys(result).every((k) => keys.includes(k)),
    t('Unbekannte Felder oder nicht unterstützte Version.')
  );
  return result;
}
function text(value: unknown, max = 1000): value is string {
  return typeof value === 'string' && value.length <= max;
}
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}
function list(value: unknown): asserts value is unknown[] {
  ensure(
    Array.isArray(value) && value.length <= 100000,
    t('Liste erwartet oder zu viele Einträge.')
  );
}
function timestamp(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function validateDatabase(input: unknown): Database {
  const db = object(input, [
    'schemaVersion',
    'people',
    'entries',
    'topics',
    'relationships',
    'reminders',
    'deliveries',
    'settings'
  ]);
  ensure(db.schemaVersion === 1, t('Diese Dateiversion wird nicht unterstützt.'));
  for (const key of ['people', 'entries', 'relationships', 'reminders', 'deliveries'])
    list(db[key]);
  const topics = db.topics === undefined ? [] : db.topics;
  list(topics);
  const ids = new Set<string>();
  function unique(value: unknown) {
    ensure(id(value) && !ids.has(value), t('IDs müssen gültig und eindeutig sein.'));
    ids.add(value);
  }
  const people = new Set<string>();
  for (const value of db.people as unknown[]) {
    const p = object(value, [
      'id',
      'name',
      'context',
      'email',
      'phone',
      'location',
      'street',
      'houseNumber',
      'postalCode',
      'tags',
      'notes',
      'photo',
      'photoId',
      'birthday',
      'createdAt',
      'updatedAt',
      'deletedAt'
    ]);
    unique(p.id);
    people.add(p.id as string);
    ensure(text(p.name, 200) && p.name.trim(), t('Ein Name fehlt.'));
    for (const key of ['context', 'email', 'phone', 'location'])
      ensure(text(p[key], 500), t('Personenfeld {p0}.', { p0: key }));
    for (const [key, max] of [
      ['street', 500],
      ['houseNumber', 50],
      ['postalCode', 20]
    ] as const)
      ensure(p[key] === undefined || text(p[key], max), t('Personenfeld {p0}.', { p0: key }));
    ensure(text(p.notes, 50000), t('Notiz zu lang.'));
    ensure(p.photo === undefined || validPhoto(p.photo), t('Profilfoto ungültig oder zu groß.'));
    ensure(
      p.photoId === undefined ||
        (typeof p.photoId === 'string' && PHOTO_ID_PATTERN.test(p.photoId)),
      t('Profilfoto-Verweis ungültig.')
    );
    ensure(p.photo === undefined || p.photoId === undefined, t('Profilfoto doppelt angegeben.'));
    list(p.tags);
    ensure(p.tags.length <= 30 && p.tags.every((t) => text(t, 60) && t.trim()), 'Tags.');
    ensure(timestamp(p.createdAt) && timestamp(p.updatedAt), t('Zeitstempel einer Person.'));
    ensure(p.deletedAt === undefined || timestamp(p.deletedAt), t('Löschzeitpunkt einer Person.'));
    if (p.birthday !== undefined) {
      const b = object(p.birthday, ['month', 'day', 'year']);
      ensure(Number.isInteger(b.month) && Number.isInteger(b.day), t('Geburtstag.'));
      const date = `2000-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
      ensure(isDate(date), t('Geburtstag.'));
      ensure(
        b.year === undefined ||
          (Number.isInteger(b.year) &&
            Number(b.year) >= 1900 &&
            Number(b.year) <= 9998 &&
            isDate(`${b.year}-${date.slice(5)}`)),
        t('Geburtsjahr.')
      );
    }
  }
  function refs(value: unknown, required = false): asserts value is string[] {
    list(value);
    ensure(
      (!required || value.length > 0) &&
        value.length <= 100 &&
        value.every((v) => typeof v === 'string' && people.has(v)) &&
        new Set(value).size === value.length,
      t('Personenverweis fehlt oder ist doppelt.')
    );
  }
  const topicOwners = new Map<string, string>();
  for (const value of topics) {
    const topic = object(value, [
      'id',
      'personId',
      'title',
      'description',
      'state',
      'createdAt',
      'updatedAt'
    ]);
    unique(topic.id);
    ensure(
      typeof topic.personId === 'string' && people.has(topic.personId),
      t('Person eines Themas fehlt.')
    );
    ensure(
      text(topic.title, 200) &&
        topic.title.trim() &&
        text(topic.description, 50000) &&
        ['active', 'done'].includes(String(topic.state)) &&
        timestamp(topic.createdAt) &&
        timestamp(topic.updatedAt),
      t('Thema.')
    );
    topicOwners.set(topic.id as string, topic.personId as string);
  }
  for (const value of db.entries as unknown[]) {
    const e = object(value, [
      'id',
      'personIds',
      'kind',
      'contactType',
      'text',
      'date',
      'createdAt',
      'updatedAt',
      'topicId'
    ]);
    unique(e.id);
    refs(e.personIds, true);
    ensure(
      e.updatedAt === undefined || timestamp(e.updatedAt),
      t('Bearbeitungszeit eines Eintrags.')
    );
    ensure(
      e.topicId === undefined ||
        (typeof e.topicId === 'string' &&
          topicOwners.has(e.topicId) &&
          e.personIds.includes(topicOwners.get(e.topicId)!)),
      t('Themenzuordnung eines Eintrags.')
    );
    ensure(
      ['note', 'contact'].includes(String(e.kind)) &&
        text(e.contactType, 100) &&
        text(e.text, 50000) &&
        (e.kind === 'contact' || (e.text as string).trim()) &&
        isDate(e.date) &&
        timestamp(e.createdAt),
      t('Historieneintrag.')
    );
  }
  for (const value of db.relationships as unknown[]) {
    const r = object(value, ['id', 'fromId', 'toId', 'label']);
    unique(r.id);
    ensure(
      people.has(String(r.fromId)) &&
        people.has(String(r.toId)) &&
        r.fromId !== r.toId &&
        text(r.label, 100) &&
        r.label.trim(),
      t('Beziehung.')
    );
  }
  for (const value of db.reminders as unknown[]) {
    const r = object(value, [
      'id',
      'personIds',
      'title',
      'date',
      'recurrence',
      'intervalDays',
      'state',
      'completed',
      'snooze',
      'createdAt'
    ]);
    unique(r.id);
    refs(r.personIds);
    ensure(
      text(r.title, 500) && r.title.trim() && isDate(r.date) && timestamp(r.createdAt),
      t('Erinnerung.')
    );
    ensure(
      ['once', 'annual', 'interval'].includes(String(r.recurrence)) &&
        ['active', 'paused', 'done'].includes(String(r.state)),
      t('Erinnerungstyp oder Status.')
    );
    if (r.recurrence === 'interval')
      ensure(
        r.personIds.length === 1 &&
          Number.isInteger(r.intervalDays) &&
          Number(r.intervalDays) >= 1 &&
          Number(r.intervalDays) <= 3650,
        t('Kontaktintervall.')
      );
    list(r.completed);
    ensure(r.completed.every(isDate), t('Erledigte Termine.'));
    if (r.snooze !== undefined) {
      const s = object(r.snooze, ['occurrence', 'date']);
      ensure(isDate(s.occurrence) && isDate(s.date), t('Verschobener Termin.'));
    }
  }
  const days = new Set<string>();
  for (const value of db.deliveries as unknown[]) {
    const d = object(value, [
      'id',
      'date',
      'status',
      'attempts',
      'nextAttemptAt',
      'createdAt',
      'updatedAt',
      'subject',
      'text',
      'error'
    ]);
    unique(d.id);
    ensure(isDate(d.date) && !days.has(d.date), t('Mehrere Tagesübersichten für denselben Tag.'));
    days.add(d.date);
    ensure(
      ['pending', 'sent', 'failed', 'skipped'].includes(String(d.status)) &&
        Number.isInteger(d.attempts) &&
        Number(d.attempts) >= 0,
      t('Versandstatus.')
    );
    ensure(
      timestamp(d.nextAttemptAt) &&
        timestamp(d.createdAt) &&
        timestamp(d.updatedAt) &&
        text(d.subject, 500) &&
        text(d.text, 5000000) &&
        (d.error === undefined || text(d.error, 2000)),
      t('Versandeintrag.')
    );
  }
  const s = object(db.settings, ['timezone', 'digestTime', 'emailEnabled']);
  ensure(
    typeof s.timezone === 'string' &&
      validTimezone(s.timezone) &&
      typeof s.digestTime === 'string' &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(s.digestTime) &&
      typeof s.emailEnabled === 'boolean',
    t('Einstellungen.')
  );
  return structuredClone({ ...db, topics }) as Database;
}
