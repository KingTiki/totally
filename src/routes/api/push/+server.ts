import { t } from '../../../lib/server/language.ts';
import { error, json } from '@sveltejs/kit';
import { runtime } from '#lib/server/runtime';

export async function POST({ request }: import('./$types').RequestEvent) {
  const raw = await request.text();
  if (raw.length > 16000) error(413, t('Push-Anfrage ist zu groß.'));
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch {
    error(400, t('Ungültige Push-Anfrage.'));
  }
  const { push, pushState } = await runtime();
  try {
    if (body.operation === 'subscribe') {
      const id = await push.subscribe(body.subscription, body.label);
      return json({ id });
    }
    if (body.operation === 'status') {
      const device = pushState.snapshot().devices.find((d) => d.endpoint === body.endpoint);
      return json({ id: device?.id ?? null });
    }
    if (typeof body.id !== 'string' || body.id.length > 100)
      throw new Error(t('Gerät wurde nicht gefunden.'));
    if (body.operation === 'unsubscribe') {
      await push.remove(body.id);
      return json({ success: true });
    }
    if (body.operation === 'test') {
      await push.test(body.id);
      return json({ success: true });
    }
    throw new Error(t('Unbekannte Push-Aktion.'));
  } catch (cause) {
    const filesystem = 'code' in Object(cause);
    error(
      400,
      filesystem
        ? t('Push-Daten konnten nicht gespeichert werden. Bitte die Serverprotokolle prüfen.')
        : (cause as Error).message
    );
  }
}
