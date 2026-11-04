import { t } from '../../lib/server/language.ts';
import { redirect } from '@sveltejs/kit';
import { runtime } from '#lib/server/runtime';
import { lastContact } from '#lib/agenda';
import { perform, personFromForm, trashPeople } from '#lib/server/actions';
import { activeDatabase, isActivePerson } from '#lib/people';
export async function load() {
  const { store } = await runtime(),
    db = activeDatabase(store.snapshot());
  return {
    people: db.people
      .map((p) => ({ ...p, lastContact: lastContact(db, p.id) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  };
}
export const actions = {
  trash: async ({ request }: import('./$types').RequestEvent) =>
    perform(
      async () => trashPeople(await request.formData()),
      t('Kontakte in den Papierkorb verschoben.')
    ),
  create: async ({ request }: import('./$types').RequestEvent) => {
    let id = '';
    const result = await perform(async () => {
      const form = await request.formData();
      const { store } = await runtime();
      await store.update((db) => {
        const person = personFromForm(
          form,
          undefined,
          db.people.filter(isActivePerson).flatMap((person) => person.tags)
        );
        id = person.id;
        db.people.push(person);
      });
    });
    if ('success' in result) redirect(303, `/personen/${id}`);
    return result;
  }
};
