import { t } from '../../../lib/server/language.ts';
import { error } from '@sveltejs/kit';
import { runtime } from '#lib/server/runtime';
import { PHOTO_ID_PATTERN } from '#lib/photo';

export async function GET({ params, request }: import('./$types').RequestEvent) {
  const { store } = await runtime();
  const id = params.id;
  if (!PHOTO_ID_PATTERN.test(id) || !store.hasPhoto(id))
    error(404, t('Dieses Profilfoto wurde nicht gefunden.'));
  const headers = {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'private, no-cache',
    ETag: `"${id}"`,
    'X-Content-Type-Options': 'nosniff'
  };
  if (request.headers.get('if-none-match') === headers.ETag)
    return new Response(null, { status: 304, headers });
  try {
    return new Response(new Uint8Array(await store.photos.read(id)), { headers });
  } catch {
    error(404, t('Dieses Profilfoto wurde nicht gefunden.'));
  }
}
