import { t } from '../../lib/server/language.ts';
import { runtime } from '#lib/server/runtime';
import { localClock, addDays } from '#lib/dates';
import { agenda } from '#lib/agenda';
import { activeDatabase } from '#lib/people';
import { perform, createReminder, changeReminder } from '#lib/server/actions';
export async function load({ url, locals }: import('./$types').PageServerLoadEvent) {
  const { store } = await runtime(),
    db = activeDatabase(store.snapshot()),
    today = localClock(new Date(), db.settings.timezone).date;
  const candidate = url.searchParams.get('monat') || today.slice(0, 7);
  const month =
    /^(19\d\d|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(candidate) && candidate < '9998-12'
      ? candidate
      : today.slice(0, 7);
  const first = `${month}-01`,
    d = new Date(first + 'T12:00:00Z');
  const start = addDays(first, -((d.getUTCDay() + 6) % 7));
  const end = addDays(start, 41);
  const previous = new Date(d);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const next = new Date(d);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return {
    month,
    start,
    end,
    previous: previous.toISOString().slice(0, 7),
    next: next.toISOString().slice(0, 7),
    items: agenda(db, start, end, false, locals.language),
    people: db.people
  };
}
export const actions = {
  create: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => createReminder(await request.formData()), t('Erinnerung angelegt.')),
  reminder: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => changeReminder(await request.formData()), t('Erinnerung aktualisiert.'))
};
