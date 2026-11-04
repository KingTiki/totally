import { t } from '../lib/server/language.ts';
import { runtime } from '#lib/server/runtime';
import { localClock } from '#lib/dates';
import { FOOTER_PHRASES } from '#lib/footer-phrases';
import { isActivePerson } from '#lib/people';
export async function load({ locals }: import('./$types').LayoutServerLoadEvent) {
  if (!locals.authenticated)
    return { language: locals.language, authenticated: false, today: '', peopleCount: 0 };
  const { store } = await runtime(),
    db = store.snapshot();
  return {
    authenticated: true,
    language: locals.language,
    footerPhrase: t('Wir sollten mal... {p0}', {
      p0: t.footer(FOOTER_PHRASES[Math.floor(Math.random() * FOOTER_PHRASES.length)])
    }),
    today: localClock(new Date(), db.settings.timezone).date,
    peopleCount: db.people.filter(isActivePerson).length
  };
}
