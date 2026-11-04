import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (password.length > 1024) return false;
  const [scheme, salt, digest] = hash.split(':');
  if (scheme !== 'scrypt' || !salt || !digest) return false;
  const actual = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function signature(payload: string, secret: string, passwordHash: string) {
  return createHmac('sha256', secret).update(`${passwordHash}:${payload}`).digest('base64url');
}
export function createSession(secret: string, passwordHash: string, now = Date.now()): string {
  const payload = `${now + 7 * 86400000}.${randomBytes(16).toString('hex')}`;
  return `${payload}.${signature(payload, secret, passwordHash)}`;
}
export function validSession(
  token: string | undefined,
  secret: string,
  passwordHash: string,
  now = Date.now()
): boolean {
  if (!token || token.length > 250) return false;
  const parts = token.split('.');
  if (
    parts.length !== 3 ||
    !/^\d+$/.test(parts[0]) ||
    Number(parts[0]) <= now ||
    Number(parts[0]) > now + 7 * 86400000
  )
    return false;
  const expected = Buffer.from(signature(`${parts[0]}.${parts[1]}`, secret, passwordHash));
  const actual = Buffer.from(parts[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// A single bounded instance-wide budget avoids trusting proxy-provided client addresses.
const attempts: number[] = [];
export function allowLogin(now = Date.now()): boolean {
  while (attempts.length && attempts[0] < now - 15 * 60000) attempts.shift();
  if (attempts.length >= 15) return false;
  attempts.push(now);
  return true;
}
