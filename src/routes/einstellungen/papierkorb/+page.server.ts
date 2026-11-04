import { t } from '../../../lib/server/language.ts';
import { runtime } from '#lib/server/runtime';
import { perform, restorePerson } from '#lib/server/actions';

export async function load() {
  const { store } = await runtime();
  const db = store.snapshot();
  return {
    timezone: db.settings.timezone,
    people: db.people
      .filter((person) => person.deletedAt)
      .sort(
        (a, b) => b.deletedAt!.localeCompare(a.deletedAt!) || a.name.localeCompare(b.name, 'de')
      )
  };
}

export const actions = {
  restore: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => restorePerson(await request.formData()), t('Kontakt wiederhergestellt.'))
};
