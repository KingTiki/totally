import { t } from './language.ts';
import { randomUUID } from 'node:crypto';
import { fail } from '@sveltejs/kit';
import type { Database, Person, Entry } from '../model.ts';
import { addDays, isDate, localClock, annualDate, validTimezone } from '../dates.ts';
import { lastContact } from '../agenda.ts';
import { runtime } from './runtime.ts';
import { PHOTO_MAX_LENGTH, photoSource } from '../photo.ts';
import { normalizeTags } from '../tags.ts';
import { contactRhythms } from '../contact-rhythm.ts';
import { activePerson, availableReminder, isActivePerson } from '../people.ts';

export function field(form: FormData, name: string, max = 500): string {
  const value = form.get(name);
  if (typeof value !== 'string') return '';
  const result = value.trim();
  if (result.length > max) throw new Error(t('{p0}: maximal {p1} Zeichen.', { p0: name, p1: max }));
  return result;
}
function required(form: FormData, name: string, label: string, max = 500): string {
  const value = field(form, name, max);
  if (!value) throw new Error(t('{p0} fehlt.', { p0: label }));
  return value;
}
function personRefs(form: FormData, db: Database, required = false): string[] {
  const ids = [
    ...new Set(form.getAll('personIds').filter((v): v is string => typeof v === 'string' && !!v))
  ];
  if (required && !ids.length) throw new Error(t('Bitte mindestens eine Person auswählen.'));
  if (ids.some((id) => !activePerson(db, id)))
    throw new Error(t('Eine ausgewählte Person existiert nicht mehr.'));
  return ids;
}
function dateField(form: FormData, name = 'date'): string {
  const date = field(form, name);
  if (!isDate(date)) throw new Error(t('Bitte ein gültiges Datum angeben.'));
  return date;
}
export async function perform(action: () => Promise<unknown>, message = t('Gespeichert.')) {
  try {
    await action();
    return { success: message };
  } catch (error) {
    const message = (error as Error).message;
    const filesystem = 'code' in Object(error);
    if (filesystem)
      console.error(t('Speichern fehlgeschlagen:'), (error as NodeJS.ErrnoException).code);
    return fail(400, {
      error: filesystem
        ? t('Speichern fehlgeschlagen. Bitte Speicherplatz und Schreibrechte prüfen.')
        : message
    });
  }
}
export function personFromForm(
  form: FormData,
  existing?: Person,
  availableTags: string[] = []
): Person {
  if (existing && !isActivePerson(existing))
    throw new Error(t('Diese Person liegt im Papierkorb.'));
  const now = new Date().toISOString();
  const selection = form.has('photo')
    ? field(form, 'photo', PHOTO_MAX_LENGTH)
    : photoSource(existing || {});
  const photoId =
    existing?.photoId && selection === photoSource(existing) ? existing.photoId : undefined;
  const photo = photoId ? undefined : selection;
  const street = form.has('street') ? field(form, 'street') : existing?.street;
  const houseNumber = form.has('houseNumber')
    ? field(form, 'houseNumber', 50)
    : existing?.houseNumber;
  const postalCode = form.has('postalCode') ? field(form, 'postalCode', 20) : existing?.postalCode;
  const month = field(form, 'birthMonth'),
    day = field(form, 'birthDay'),
    year = field(form, 'birthYear');
  if (!!month !== !!day || (year && (!month || !day)))
    throw new Error(t('Für einen Geburtstag bitte Tag und Monat angeben.'));
  const birthday =
    month && day
      ? { month: Number(month), day: Number(day), ...(year ? { year: Number(year) } : {}) }
      : undefined;
  return {
    id: existing?.id ?? randomUUID(),
    name: required(form, 'name', t('Name'), 200),
    context: field(form, 'context'),
    email: field(form, 'email'),
    phone: field(form, 'phone'),
    location: field(form, 'location'),
    ...(street ? { street } : {}),
    ...(houseNumber ? { houseNumber } : {}),
    ...(postalCode ? { postalCode } : {}),
    tags: normalizeTags(field(form, 'tags', 2000).split(','), [
      ...availableTags,
      ...(existing?.tags || [])
    ]),
    notes: field(form, 'notes', 50000),
    ...(photo ? { photo } : {}),
    ...(photoId ? { photoId } : {}),
    ...(birthday ? { birthday } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}
export async function trashPeople(form: FormData): Promise<void> {
  if (form.get('confirm') !== 'on')
    throw new Error(t('Bitte das Verschieben in den Papierkorb bestätigen.'));
  const ids = [...new Set(form.getAll('personIds'))];
  if (!ids.length || ids.length > 1000 || ids.some((id) => typeof id !== 'string' || !id))
    throw new Error(t('Bitte 1 bis 1000 Kontakte auswählen.'));
  const { store } = await runtime();
  await store.update((db) => {
    const people = ids.map((id) => {
      const person = activePerson(db, String(id));
      if (!person)
        throw new Error(
          t(
            'Ein Kontakt wurde nicht gefunden oder liegt bereits im Papierkorb. Bitte die Seite neu laden.'
          )
        );
      return person;
    });
    for (const person of people) {
      if (form.get(`version:${person.id}`) !== person.updatedAt)
        throw new Error(t('Ein Kontakt wurde inzwischen geändert. Bitte die Seite neu laden.'));
    }
    for (const person of people) {
      const now = nextEditTime(person.updatedAt);
      person.deletedAt = now;
      person.updatedAt = now;
    }
  });
}
export async function restorePerson(form: FormData): Promise<void> {
  const { store } = await runtime();
  await store.update((db) => {
    const person = db.people.find((person) => person.id === field(form, 'id') && person.deletedAt);
    if (!person) throw new Error(t('Dieser Kontakt liegt nicht im Papierkorb.'));
    if (field(form, 'version') !== person.deletedAt)
      throw new Error(t('Dieser Kontakt wurde inzwischen geändert. Bitte die Seite neu laden.'));
    delete person.deletedAt;
    person.updatedAt = nextEditTime(person.updatedAt);
  });
}
export async function createEntry(form: FormData): Promise<void> {
  const { store } = await runtime();
  await store.update((db) => {
    const values = entryValues(form, db);
    const { personIds } = values;
    const before = contactDates(db, personIds);
    db.entries.push({
      id: randomUUID(),
      ...values,
      createdAt: new Date().toISOString()
    });
    refreshContactDates(db, before);
    touchTopics(db, [values.topicId]);
    const followUp = field(form, 'followUp');
    if (followUp) {
      if (!isDate(followUp)) throw new Error(t('Datum der Wiedervorlage ist ungültig.'));
      db.reminders.push({
        id: randomUUID(),
        personIds,
        title: field(form, 'followUpTitle') || t('Nachfragen'),
        date: followUp,
        recurrence: 'once',
        state: 'active',
        completed: [],
        createdAt: new Date().toISOString()
      });
    }
  });
}
function entryValues(
  form: FormData,
  db: Database,
  existing?: Entry
): Omit<Entry, 'id' | 'createdAt' | 'updatedAt'> {
  const personIds = personRefs(form, db, true);
  // Editing a shared entry must not silently unlink people in the trash.
  if (existing) {
    for (const id of existing.personIds) {
      if (!activePerson(db, id)) personIds.push(id);
    }
  }
  const kind = field(form, 'kind');
  if (kind !== 'note' && kind !== 'contact')
    throw new Error(t('Bitte einen gültigen Eintragstyp auswählen.'));
  const date = dateField(form);
  if (date > localClock(new Date(), db.settings.timezone).date)
    throw new Error(
      t('Gespräche und Notizen können nicht in der Zukunft liegen. Nutze dafür eine Erinnerung.')
    );
  const previousTopic =
    existing?.topicId && db.topics.find((topic) => topic.id === existing.topicId);
  const topicId =
    field(form, 'topicId') ||
    (previousTopic && !activePerson(db, previousTopic.personId) ? previousTopic.id : '');
  if (topicId) {
    const topic = db.topics.find((topic) => topic.id === topicId);
    if (
      !topic ||
      !personIds.includes(topic.personId) ||
      (!activePerson(db, topic.personId) && existing?.topicId !== topicId)
    )
      throw new Error(
        t('Bitte die Person des Themas auswählen oder die Themenzuordnung entfernen.')
      );
    if (topic.state === 'done' && existing?.topicId !== topicId)
      throw new Error(t('Dieses Thema ist abgeschlossen. Bitte zuerst wieder öffnen.'));
  }
  return {
    personIds,
    kind,
    date,
    text:
      kind === 'contact' ? field(form, 'text', 50000) : required(form, 'text', t('Notiz'), 50000),
    contactType: field(form, 'contactType', 100) || t('Kontakt'),
    ...(topicId ? { topicId } : {})
  };
}
function contactDates(db: Database, ids: string[]) {
  return new Map(ids.map((id) => [id, lastContact(db, id)]));
}
function refreshContactDates(db: Database, before: Map<string, string | undefined>) {
  for (const [personId, previous] of before) {
    const latest = lastContact(db, personId);
    if (latest === previous) continue;
    for (const reminder of contactRhythms(db, personId)) {
      const start = latest || localClock(new Date(reminder.createdAt), db.settings.timezone).date;
      reminder.date = addDays(start, reminder.intervalDays!);
      reminder.completed = [];
      delete reminder.snooze;
    }
  }
}
function touchTopics(db: Database, ids: (string | undefined)[]) {
  for (const topic of db.topics)
    if (ids.includes(topic.id)) topic.updatedAt = nextEditTime(topic.updatedAt);
}
function nextEditTime(previous?: string) {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}
export async function updateEntry(personId: string, form: FormData): Promise<void> {
  const { store } = await runtime();
  await store.update((db) => {
    if (!activePerson(db, personId)) throw new Error(t('Person nicht gefunden.'));
    const existing = db.entries.find(
      (entry) => entry.id === field(form, 'id') && entry.personIds.includes(personId)
    );
    if (!existing)
      throw new Error(t('Dieser Eintrag wurde nicht gefunden. Bitte die Seite neu laden.'));
    if (field(form, 'version') !== (existing.updatedAt || existing.createdAt))
      throw new Error(t('Dieser Eintrag wurde inzwischen geändert. Bitte die Seite neu laden.'));
    const values = entryValues(form, db, existing);
    const before = contactDates(db, [...new Set([...existing.personIds, ...values.personIds])]);
    const oldTopic = existing.topicId;
    delete existing.topicId;
    Object.assign(existing, values, {
      updatedAt: nextEditTime(existing.updatedAt || existing.createdAt)
    });
    refreshContactDates(db, before);
    touchTopics(db, [oldTopic, values.topicId]);
  });
}
export async function deleteEntry(personId: string, form: FormData): Promise<void> {
  if (form.get('confirm') !== 'on')
    throw new Error(t('Bitte das Löschen des Eintrags bestätigen.'));
  const { store } = await runtime();
  await store.update((db) => {
    if (!activePerson(db, personId)) throw new Error(t('Person nicht gefunden.'));
    const existing = db.entries.find(
      (entry) => entry.id === field(form, 'id') && entry.personIds.includes(personId)
    );
    if (!existing)
      throw new Error(t('Dieser Eintrag wurde nicht gefunden. Bitte die Seite neu laden.'));
    if (field(form, 'version') !== (existing.updatedAt || existing.createdAt))
      throw new Error(t('Dieser Eintrag wurde inzwischen geändert. Bitte die Seite neu laden.'));
    const before = contactDates(db, existing.personIds);
    db.entries = db.entries.filter((entry) => entry.id !== existing.id);
    refreshContactDates(db, before);
    touchTopics(db, [existing.topicId]);
  });
}
export async function saveTopic(personId: string, form: FormData): Promise<void> {
  const { store } = await runtime();
  await store.update((db) => {
    if (!activePerson(db, personId)) throw new Error(t('Person nicht gefunden.'));
    const id = field(form, 'id'),
      operation = field(form, 'operation');
    const existing = id
      ? db.topics.find((topic) => topic.id === id && topic.personId === personId)
      : undefined;
    if (id && !existing) throw new Error(t('Dieses Thema wurde nicht gefunden.'));
    const now = nextEditTime(existing?.updatedAt);
    if (operation === 'complete' || operation === 'reopen') {
      if (!existing) throw new Error(t('Dieses Thema wurde nicht gefunden.'));
      existing.state = operation === 'complete' ? 'done' : 'active';
      existing.updatedAt = now;
      return;
    }
    if (operation !== 'save') throw new Error(t('Unbekannte Themen-Aktion.'));
    if (existing && field(form, 'version') !== existing.updatedAt)
      throw new Error(t('Dieses Thema wurde inzwischen geändert. Bitte die Seite neu laden.'));
    const title = required(form, 'title', t('Thema'), 200),
      description = field(form, 'description', 50000);
    if (existing) Object.assign(existing, { title, description, updatedAt: now });
    else
      db.topics.push({
        id: randomUUID(),
        personId,
        title,
        description,
        state: 'active',
        createdAt: now,
        updatedAt: now
      });
  });
}
export async function createReminder(form: FormData): Promise<void> {
  const { store } = await runtime();
  await store.update((db) => {
    const personIds = personRefs(form, db),
      recurrence = field(form, 'recurrence');
    if (!['once', 'annual', 'interval'].includes(recurrence))
      throw new Error(t('Bitte einen gültigen Erinnerungstyp auswählen.'));
    const intervalDays = Number(field(form, 'intervalDays'));
    if (
      recurrence === 'interval' &&
      (personIds.length !== 1 ||
        !Number.isInteger(intervalDays) ||
        intervalDays < 1 ||
        intervalDays > 3650)
    )
      throw new Error(t('Ein Kontaktintervall benötigt genau eine Person und 1–3650 Tage.'));
    if (recurrence === 'interval' && contactRhythms(db, personIds[0]).length)
      throw new Error(
        t(
          'Für diese Person ist bereits ein Kontaktrhythmus eingestellt. Bitte im Personenprofil ändern.'
        )
      );
    const date =
      recurrence === 'interval'
        ? addDays(
            lastContact(db, personIds[0]) || localClock(new Date(), db.settings.timezone).date,
            intervalDays
          )
        : dateField(form);
    db.reminders.push({
      id: randomUUID(),
      personIds,
      title: required(form, 'title', t('Titel')),
      date,
      recurrence: recurrence as 'once' | 'annual' | 'interval',
      ...(recurrence === 'interval' ? { intervalDays } : {}),
      state: 'active',
      completed: [],
      createdAt: new Date().toISOString()
    });
  });
}
export async function saveContactRhythm(personId: string, form: FormData): Promise<void> {
  const { store } = await runtime();
  await store.update((db) => {
    const person = activePerson(db, personId);
    if (!person) throw new Error(t('Person nicht gefunden.'));
    const rhythms = contactRhythms(db, personId),
      current = rhythms[0];
    const operation = field(form, 'operation');
    if (!['save', 'pause', 'resume', 'off'].includes(operation))
      throw new Error(t('Unbekannte Rhythmus-Aktion.'));
    if (operation !== 'save' && !current)
      throw new Error(t('Es ist noch kein Kontaktrhythmus eingestellt.'));
    if (operation === 'pause' || operation === 'off') {
      for (const rhythm of rhythms) rhythm.state = operation === 'pause' ? 'paused' : 'done';
      return;
    }
    if (operation === 'resume') current.state = 'active';
    else {
      const days = Number(field(form, 'intervalDays'));
      if (!Number.isInteger(days) || days < 1 || days > 3650)
        throw new Error(t('Bitte einen Abstand von 1 bis 3650 Tagen angeben.'));
      if (current) {
        if (current.intervalDays !== days) {
          // Preserve the current cycle's start, also after a manual completion.
          current.date = addDays(addDays(current.date, -current.intervalDays!), days);
          current.intervalDays = days;
          current.completed = [];
          delete current.snooze;
        }
      } else {
        const today = localClock(new Date(), db.settings.timezone).date;
        db.reminders.push({
          id: randomUUID(),
          personIds: [personId],
          title: t('Bei {p0} melden', { p0: person.name }),
          date: addDays(lastContact(db, personId) || today, days),
          recurrence: 'interval',
          intervalDays: days,
          state: 'active',
          completed: [],
          createdAt: new Date().toISOString()
        });
      }
    }
    // Older exports may contain multiple intervals. Keep their history, but only
    // one schedule continues after the user explicitly saves or resumes here.
    for (const duplicate of rhythms.slice(1)) duplicate.state = 'done';
  });
}
export async function changeReminder(form: FormData): Promise<void> {
  const { store } = await runtime();
  await store.update((db) => {
    const reminder = db.reminders.find((r) => r.id === field(form, 'id'));
    if (!reminder) throw new Error(t('Die Erinnerung wurde nicht gefunden.'));
    if (!availableReminder(db, reminder))
      throw new Error(t('Diese Erinnerung betrifft einen Kontakt im Papierkorb.'));
    const action = field(form, 'operation');
    if (action === 'pause') {
      reminder.state = 'paused';
      return;
    }
    if (action === 'resume') {
      reminder.state = 'active';
      return;
    }
    const occurrence = dateField(form, 'occurrence');
    const validOccurrence =
      reminder.recurrence === 'annual'
        ? annualDate(
            Number(reminder.date.slice(5, 7)),
            Number(reminder.date.slice(8)),
            Number(occurrence.slice(0, 4))
          ) === occurrence && occurrence >= reminder.date
        : occurrence === reminder.date;
    if (!validOccurrence || reminder.state !== 'active')
      throw new Error(t('Dieser Termin ist nicht mehr aktuell. Bitte die Seite neu laden.'));
    if (action === 'complete') {
      if (reminder.completed.includes(occurrence)) return;
      if (reminder.recurrence === 'once') reminder.state = 'done';
      else if (reminder.recurrence === 'interval')
        reminder.date = addDays(
          localClock(new Date(), db.settings.timezone).date,
          reminder.intervalDays!
        );
      else reminder.completed.push(occurrence);
      delete reminder.snooze;
    } else if (action === 'snooze') {
      const date = dateField(form, 'until');
      if (date < localClock(new Date(), db.settings.timezone).date)
        throw new Error(t('Bitte auf heute oder später verschieben.'));
      reminder.snooze = { occurrence, date };
    } else throw new Error(t('Unbekannte Erinnerungsaktion.'));
  });
}
export async function saveSettings(form: FormData): Promise<void> {
  const { store, config } = await runtime();
  const timezone = field(form, 'timezone'),
    digestTime = field(form, 'digestTime');
  if (!validTimezone(timezone) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(digestTime))
    throw new Error(t('Zeitzone oder Versandzeit ist ungültig.'));
  const emailEnabled = form.get('emailEnabled') === 'on';
  if (emailEnabled && (!config.smtp.host || !config.smtp.from || !config.smtp.to))
    throw new Error(
      t('Bitte zuerst SMTP_HOST, SMTP_FROM und SMTP_TO in der Umgebung konfigurieren.')
    );
  await store.update((db) => {
    db.settings = { timezone, digestTime, emailEnabled };
  });
}
