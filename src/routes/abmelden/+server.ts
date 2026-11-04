import { redirect } from '@sveltejs/kit';
export function POST({ cookies }: import('./$types').RequestEvent) {
  cookies.delete('nahbei_session', { path: '/' });
  redirect(303, '/login');
}
