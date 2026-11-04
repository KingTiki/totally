import type { Page } from '@playwright/test';
import { createSession } from '../../src/lib/server/auth.ts';

// Feature tests use the isolated server's test session. Authentication tests
// continue to exercise the login form and its instance-wide rate limit.
export async function authenticate(page: Page) {
  const secret = process.env.SESSION_SECRET,
    hash = process.env.PASSWORD_HASH;
  if (!secret?.startsWith('browser-test-only-') || !hash)
    throw new Error('Die isolierte Browser-Testumgebung wurde nicht gestartet.');
  await page.context().addCookies([
    {
      name: 'nahbei_session',
      value: createSession(secret, hash),
      url: 'http://127.0.0.1:4173',
      httpOnly: true,
      sameSite: 'Strict'
    }
  ]);
  await page.goto('/');
}
