import { runtime } from '#lib/server/runtime';
export async function GET() {
  try {
    const { store, pushState } = await runtime();
    store.snapshot();
    pushState.snapshot();
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
