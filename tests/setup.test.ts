import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { temporaryDirectory } from './helpers.ts';
import { verifyPassword } from '../src/lib/server/auth.ts';

test('setup generates Docker-only credentials on separate streams and protects existing env files', async (t) => {
  const directory = await temporaryDirectory(t);
  const script = fileURLToPath(new URL('../scripts/setup.mjs', import.meta.url));
  const options = {
    cwd: directory,
    encoding: 'utf8' as const,
    env: { ...process.env, ORIGIN: 'https://crm.example.test' },
    windowsHide: true
  };
  const result = spawnSync(process.execPath, [script, '--stdout'], options);
  assert.equal(result.status, 0);
  const hash = result.stdout.match(/^PASSWORD_HASH=(.+)$/m)?.[1];
  const password = result.stderr.match(/\n([A-Za-z0-9_-]{24})\n/)?.[1];
  assert(hash && password);
  assert(await verifyPassword(password, hash));
  assert(!result.stdout.includes(password));
  assert.match(result.stdout, /COOKIE_SECURE=true/);
  assert.match(result.stdout, /^SESSION_SECRET=[a-f0-9]{64}$/m);
  const normal = spawnSync(process.execPath, [script], options);
  assert.equal(normal.status, 0);
  const before = await readFile(join(directory, '.env'), 'utf8');
  assert.match(before, /^PASSWORD_HASH=scrypt:/m);
  await writeFile(join(directory, '.env'), 'keep-my-settings');
  assert.equal(spawnSync(process.execPath, [script], options).status, 1);
  assert.equal(await readFile(join(directory, '.env'), 'utf8'), 'keep-my-settings');
});
