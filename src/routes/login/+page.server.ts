import { t } from '../../lib/server/language.ts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { runtime } from '#lib/server/runtime';
import { allowLogin, createSession, verifyPassword } from '#lib/server/auth';
export const actions: Actions = {
  default: async ({ request, cookies }) => {
    if (!allowLogin())
      return fail(429, { error: t('Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.') });
    const form = await request.formData(),
      password = form.get('password');
    const { config } = await runtime();
    if (typeof password !== 'string' || !(await verifyPassword(password, config.passwordHash)))
      return fail(400, { error: t('Das Passwort stimmt nicht.') });
    cookies.set('nahbei_session', createSession(config.sessionSecret, config.passwordHash), {
      path: '/',
      httpOnly: true,
      secure: config.secure,
      sameSite: 'strict',
      maxAge: 7 * 86400
    });
    redirect(303, '/');
  }
};
