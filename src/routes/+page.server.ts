import { t } from '../lib/server/language.ts';
import { runtime } from '#lib/server/runtime';
import { upcoming } from '#lib/agenda';
import { activeDatabase } from '#lib/people';
import { perform, changeReminder, createEntry, createReminder } from '#lib/server/actions';
export async function load({ locals }: import('./$types').PageServerLoadEvent) {
  const { store, pushState } = await runtime(),
    db = activeDatabase(store.snapshot());
  return {
    items: upcoming(db, new Date(), locals.language),
    people: db.people,
    topics: db.topics,
    settings: db.settings,
    pushDeviceCount: pushState.snapshot().devices.length,
    paused: db.reminders.filter((r) => r.state === 'paused')
  };
}
export const actions = {
  reminder: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => changeReminder(await request.formData()), t('Erinnerung aktualisiert.')),
  entry: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => createEntry(await request.formData()), t('Eintrag gespeichert.')),
  create: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => createReminder(await request.formData()), t('Erinnerung angelegt.'))
};
