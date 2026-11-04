import { t } from './lib/server/language.ts';
import { building } from '$app/env';
import { redirect, error } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { runtime } from '#lib/server/runtime';
import { validSession } from '#lib/server/auth';
import { withLanguage } from '#lib/server/language';

export const init: ServerInit = async () => {
  if (!building) {
    const { worker } = await runtime();
    worker.start();
  }
};
export const handle: Handle = async ({ event, resolve }) => {
  const { config, preferences } = await runtime();
  const language = preferences.snapshot().language;
  event.locals.language = language;
  return withLanguage(language, async () => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) &&
      event.request.headers.get('origin') !== event.url.origin
    ) {
      error(403, t('Diese Anfrage stammt nicht von der Anwendung.'));
    }
    event.locals.authenticated = validSession(
      event.cookies.get('nahbei_session'),
      config.sessionSecret,
      config.passwordHash
    );
    if (!event.locals.authenticated && !['/login', '/healthz'].includes(event.url.pathname)) {
      if (event.url.pathname.startsWith('/api/') || event.url.pathname.startsWith('/photos/'))
        error(401, t('Bitte erneut anmelden.'));
      redirect(303, '/login');
    }
    if (event.locals.authenticated && event.url.pathname === '/login') redirect(303, '/');
    const response = await resolve(event, {
      transformPageChunk: ({ html }) => html.replaceAll('%totally.language%', language)
    });
    if (!(
      event.locals.authenticated &&
      event.url.pathname.startsWith('/photos/') &&
      [200, 304].includes(response.status)
    ))
      response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'same-origin');
    response.headers.set(
      'Content-Security-Policy',
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
    );
    return response;
  });
};
