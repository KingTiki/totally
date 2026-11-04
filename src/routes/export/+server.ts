import { runtime } from '#lib/server/runtime';
import { createBackup } from '#lib/server/backup';
import { APP_SLUG } from '#lib/brand';
export async function GET({ url }: import('./$types').RequestEvent) {
  const { store } = await runtime();
  const metadataOnly = url.searchParams.get('format') === 'json';
  return new Response(
    metadataOnly ? JSON.stringify(store.snapshot(), null, 2) + '\n' : await createBackup(store),
    {
      headers: {
        'Content-Type': metadataOnly ? 'application/json; charset=utf-8' : 'application/zip',
        'Content-Disposition': `attachment; filename="${APP_SLUG}-${new Date().toISOString().slice(0, 10)}.${metadataOnly ? 'json' : 'zip'}"`
      }
    }
  );
}
