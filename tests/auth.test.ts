import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { createSession, validSession, verifyPassword } from '../src/lib/server/auth.ts';

test('password and session validation reject tampering, expiration and rotated credentials', async () => {
  const salt = '0123456789abcdef0123456789abcdef';
  const hash = `scrypt:${salt}:${scryptSync('test-password', salt, 64).toString('hex')}`;
  assert(await verifyPassword('test-password', hash));
  assert(!(await verifyPassword('wrong', hash)));
  const secret = 'a'.repeat(64),
    now = Date.parse('2026-10-24T12:00:00Z');
  const token = createSession(secret, hash, now);
  assert(validSession(token, secret, hash, now));
  assert(!validSession(token + 'x', secret, hash, now));
  assert(!validSession(token, secret, hash, now + 8 * 86400000));
  assert(!validSession(token, 'b'.repeat(64), hash, now));
  assert(!validSession(token, secret, hash + '0', now));
});
