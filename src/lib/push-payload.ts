import type { Language } from './i18n/index.ts';
import { APP_NAME } from './brand.ts';
export type PushPayload = { title: string; body: string; url: string; tag: string };

export function safeNotificationUrl(value: unknown, origin: string): string {
  try {
    const url = new URL(typeof value === 'string' ? value : '/', origin);
    if (url.origin === origin && ['http:', 'https:'].includes(url.protocol)) return url.href;
  } catch {
    /* Fall back to the app. */
  }
  return new URL('/', origin).href;
}
export function notificationPayload(input: unknown, language: Language = 'en'): PushPayload {
  const value = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    title: typeof value.title === 'string' ? value.title.slice(0, 120) : APP_NAME,
    body:
      typeof value.body === 'string'
        ? value.body.slice(0, 1500)
        : language === 'de'
          ? `Du hast neue Erinnerungen. Öffne ${APP_NAME} für die Details.`
          : `You have new reminders. Open ${APP_NAME} for the details.`,
    url: typeof value.url === 'string' ? value.url : '/',
    tag: typeof value.tag === 'string' ? value.tag.slice(0, 120) : 'nahbei-reminders'
  };
}
