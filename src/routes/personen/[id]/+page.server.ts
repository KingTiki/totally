import { t } from '../../../lib/server/language.ts';
import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { runtime } from '#lib/server/runtime';
import { lastContact, upcoming } from '#lib/agenda';
import { contactRhythms } from '#lib/contact-rhythm';
import { activeDatabase, activePerson, isActivePerson } from '#lib/people';
import {
  perform,
  personFromForm,
  field,
  createEntry,
  createReminder,
  changeReminder,
  saveContactRhythm,
  updateEntry,
  deleteEntry,
  saveTopic,
  trashPeople
} from '#lib/server/actions';
export async function load({ params }: import('./$types').PageServerLoadEvent) {
  const { store } = await runtime(),
    db = activeDatabase(store.snapshot()),
    person = db.people.find((p) => p.id === params.id);
  if (!person) error(404, t('Diese Person wurde nicht gefunden.'));
  return {
    person,
    people: db.people,
    topics: db.topics,
    rhythms: contactRhythms(db, person.id),
    lastContact: lastContact(db, person.id),
    entries: db.entries
      .filter((e) => e.personIds.includes(person.id))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    relationships: db.relationships.filter((r) => r.fromId === person.id || r.toId === person.id),
    items: upcoming(db, new Date(), t.language()).filter((i) => i.personIds.includes(person.id)),
    paused: db.reminders.filter(
      (r) => r.personIds.includes(person.id) && r.state === 'paused' && r.recurrence !== 'interval'
    )
  };
}
export const actions = {
  trash: async ({ request, params }: import('./$types').RequestEvent) => {
    const result = await perform(async () => {
      const form = await request.formData();
      const ids = form.getAll('personIds');
      if (ids.length !== 1 || ids[0] !== params.id)
        throw new Error(t('Bitte diesen Kontakt auswählen.'));
      await trashPeople(form);
    });
    if ('success' in result) redirect(303, '/personen');
    return result;
  },
  deleteEntry: async ({ request, params }: import('./$types').RequestEvent) =>
    perform(async () => deleteEntry(params.id, await request.formData()), t('Eintrag gelöscht.')),
  updateEntry: async ({ request, params }: import('./$types').RequestEvent) =>
    perform(
      async () => updateEntry(params.id, await request.formData()),
      t('Eintrag aktualisiert.')
    ),
  topic: async ({ request, params }: import('./$types').RequestEvent) =>
    perform(async () => saveTopic(params.id, await request.formData()), t('Thema aktualisiert.')),
  rhythm: async ({ request, params }: import('./$types').RequestEvent) =>
    perform(
      async () => saveContactRhythm(params.id, await request.formData()),
      t('Kontaktrhythmus aktualisiert.')
    ),
  save: async ({ request, params }: import('./$types').RequestEvent) =>
    perform(async () => {
      const form = await request.formData(),
        { store } = await runtime();
      await store.update((db) => {
        const index = db.people.findIndex((p) => p.id === params.id);
        if (index === -1) throw new Error(t('Person nicht gefunden.'));
        db.people[index] = personFromForm(
          form,
          db.people[index],
          db.people.filter(isActivePerson).flatMap((person) => person.tags)
        );
      });
    }, t('Profil aktualisiert.')),
  entry: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => createEntry(await request.formData()), t('Eintrag gespeichert.')),
  create: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => createReminder(await request.formData()), t('Erinnerung angelegt.')),
  reminder: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => changeReminder(await request.formData()), t('Erinnerung aktualisiert.')),
  relationship: async ({ request, params }: import('./$types').RequestEvent) =>
    perform(async () => {
      const form = await request.formData(),
        { store } = await runtime();
      await store.update((db) => {
        const toId = field(form, 'toId'),
          label = field(form, 'label', 100);
        if (!label || toId === params.id || !activePerson(db, toId) || !activePerson(db, params.id))
          throw new Error(t('Bitte eine andere Person und eine Bezeichnung auswählen.'));
        if (
          db.relationships.some(
            (r) => r.fromId === params.id && r.toId === toId && r.label === label
          )
        )
          throw new Error(t('Diese Verbindung existiert bereits.'));
        db.relationships.push({ id: randomUUID(), fromId: params.id, toId, label });
      });
    }, t('Verbindung angelegt.')),
  removeRelationship: async ({ request, params }: import('./$types').RequestEvent) =>
    perform(async () => {
      const form = await request.formData(),
        { store } = await runtime();
      await store.update((db) => {
        if (!activePerson(db, params.id)) throw new Error(t('Person nicht gefunden.'));
        db.relationships = db.relationships.filter(
          (r) => r.id !== field(form, 'id') || (r.fromId !== params.id && r.toId !== params.id)
        );
      });
    }, t('Verbindung entfernt.'))
};
