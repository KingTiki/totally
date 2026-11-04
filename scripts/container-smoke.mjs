// Builds on the already-built totally:mvp image and uses only disposable resources.
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { readBackup } from '../src/lib/server/backup.ts';

const name = `nahbei-smoke-${randomBytes(6).toString('hex')}`;
const volume = `${name}-data`;
const password = randomBytes(24).toString('hex');
const salt = randomBytes(16).toString('hex');
const passwordHash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const origin = 'http://nahbei-smoke.local';
const image = process.env.CONTAINER_TEST_IMAGE || 'totally:mvp';
function docker(args, required = true) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true });
  if (required && result.status !== 0) {
    throw new Error(`Docker ${args[0]} fehlgeschlagen: ${result.stderr || result.error?.message}`);
  }
  return result.stdout?.trim() || '';
}
async function ready(base) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Container wurde nicht rechtzeitig bereit.');
}
try {
  docker([
    'run',
    '-d',
    '--name',
    name,
    '--mount',
    `type=volume,source=${volume},target=/app/data`,
    '-p',
    '127.0.0.1::3000',
    '-e',
    `ORIGIN=${origin}`,
    '-e',
    `PASSWORD_HASH=${passwordHash}`,
    '-e',
    `SESSION_SECRET=${randomBytes(32).toString('hex')}`,
    '-e',
    'COOKIE_SECURE=false',
    image
  ]);
  let base = `http://${docker(['port', name, '3000/tcp'])}`;
  await ready(base);
  assert.equal(docker(['exec', name, 'node', '-e', 'console.log(process.getuid())']), '1000');
  const pushPublicKey = () =>
    docker([
      'exec',
      name,
      'node',
      '-e',
      "const state=JSON.parse(require('node:fs').readFileSync('/app/data/push/data.json','utf8'));require('node:assert/strict').equal(typeof state.privateKey,'string');console.log(state.publicKey)"
    ]);
  const originalPushKey = pushPublicKey();
  assert.equal(originalPushKey.length, 87);
  assert.equal((await fetch(`${base}/manifest.webmanifest`)).status, 200);
  assert.match(await (await fetch(`${base}/login`)).text(), /<html lang="en">/);
  assert.equal((await fetch(`${base}/service-worker.js`)).status, 200);
  assert.equal((await fetch(`${base}/export?format=json`, { redirect: 'manual' })).status, 303);
  const rejected = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { Origin: 'https://attacker.invalid' },
    body: new URLSearchParams({ password }),
    redirect: 'manual'
  });
  assert.equal(rejected.status, 403);
  const login = await fetch(`${base}/login`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({ password }),
    headers: {
      Origin: origin,
      Accept: 'text/html',
      'x-nahbei-internal-host': 'attacker.invalid',
      'x-nahbei-internal-protocol': 'https'
    }
  });
  assert.equal(login.status, 303);
  const cookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith('nahbei_session='))
    ?.split(';')[0];
  assert(cookie);
  const headers = { Cookie: cookie, Origin: origin, Accept: 'text/html' };
  const unauthenticatedLanguage = await fetch(`${base}/einstellungen?/language`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: origin, Accept: 'text/html' },
    body: new URLSearchParams({ language: 'de' })
  });
  assert.equal(unauthenticatedLanguage.status, 303);
  assert.equal(unauthenticatedLanguage.headers.get('location'), '/login');
  const languageSaved = await fetch(`${base}/einstellungen?/language`, {
    method: 'POST',
    redirect: 'manual',
    headers,
    body: new URLSearchParams({ language: 'de' })
  });
  assert.equal(languageSaved.status, 303);
  assert.match(await (await fetch(`${base}/login`)).text(), /<html lang="de">/);
  const photo = `data:image/jpeg;base64,${(await readFile(new URL('../tests/fixtures/profile.jpg', import.meta.url))).toString('base64')}`;
  const created = await fetch(`${base}/personen?/create`, {
    method: 'POST',
    redirect: 'manual',
    headers,
    body: new URLSearchParams({ name: 'Container-Testperson', photo })
  });
  assert.equal(created.status, 303);
  const profilePath = created.headers.get('location');
  assert(profilePath?.startsWith('/personen/'));
  const rhythmSaved = await fetch(`${base}${profilePath}?/rhythm`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ operation: 'save', intervalDays: '28' })
  });
  assert.equal(rhythmSaved.status, 200);
  const topicSaved = await fetch(`${base}${profilePath}?/topic`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      operation: 'save',
      title: 'Container-Thema',
      description: 'Laufende Entwicklung'
    })
  });
  assert.equal(topicSaved.status, 200);
  const topicState = await (await fetch(`${base}/export?format=json`, { headers })).json();
  const personId = topicState.people[0].id,
    topicId = topicState.topics[0].id;
  const entrySaved = await fetch(`${base}${profilePath}?/entry`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      kind: 'note',
      personIds: personId,
      date: '2000-01-01',
      text: 'Ursprünglicher Eintrag',
      topicId
    })
  });
  assert.equal(entrySaved.status, 200);
  const entryState = await (await fetch(`${base}/export?format=json`, { headers })).json();
  const entry = entryState.entries[0];
  const entryUpdated = await fetch(`${base}${profilePath}?/updateEntry`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      id: entry.id,
      version: entry.createdAt,
      kind: 'note',
      personIds: personId,
      date: entry.date,
      text: 'Bearbeitet im Container',
      topicId
    })
  });
  assert.equal(entryUpdated.status, 200);
  const before = await (await fetch(`${base}/export?format=json`, { headers })).json();
  assert.equal(before.people[0].name, 'Container-Testperson');
  assert.equal(before.settings.language, undefined);
  assert.equal(before.people[0].photo, undefined);
  assert.match(before.people[0].photoId, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    Buffer.from(
      await (await fetch(`${base}/photos/${before.people[0].photoId}`, { headers })).arrayBuffer()
    ),
    Buffer.from(photo.slice(23), 'base64')
  );
  assert.equal(before.reminders[0].intervalDays, 28);
  assert.deepEqual(before.reminders[0].personIds, [before.people[0].id]);
  assert.equal(before.topics[0].title, 'Container-Thema');
  assert.equal(before.entries[0].id, entry.id);
  assert.equal(before.entries[0].topicId, topicId);
  assert.equal(before.entries[0].text, 'Bearbeitet im Container');
  assert(before.entries[0].updatedAt);
  assert(!JSON.stringify(before).includes(originalPushKey));
  const archiveResponse = await fetch(`${base}/export`, { headers });
  assert.equal(archiveResponse.headers.get('content-type'), 'application/zip');
  const archive = readBackup(new Uint8Array(await archiveResponse.arrayBuffer()));
  assert.deepEqual(archive.data, before);
  assert.deepEqual(
    Buffer.from(archive.photos.get(before.people[0].photoId)),
    Buffer.from(photo.slice(23), 'base64')
  );
  assert.equal((await fetch(`${base}/photos/${before.people[0].photoId}`)).status, 401);
  docker(['restart', name]);
  base = `http://${docker(['port', name, '3000/tcp'])}`;
  await ready(base);
  assert.equal(pushPublicKey(), originalPushKey);
  assert.match(await (await fetch(`${base}/login`)).text(), /<html lang="de">/);
  const after = await (await fetch(`${base}/export?format=json`, { headers })).json();
  assert.deepEqual(after, before);
  assert.equal(
    docker([
      'exec',
      name,
      'node',
      '-e',
      "console.log(require('node:fs').readdirSync('/app/data/backups').length)"
    ]),
    '5'
  );
  console.log(
    'Container-Smoke-Test bestanden: Login, CSRF, Nicht-root-Betrieb, geschützte Profilfotos, ZIP-Sicherung, Kontaktrhythmus, Themen und Historie, PWA und persistente Daten/Push-Schlüssel/Sprachwahl nach Neustart.'
  );
} catch (error) {
  console.error(
    docker(['inspect', '--format', '{{.State.Status}} {{.State.ExitCode}}', name], false)
  );
  const logs = spawnSync('docker', ['logs', '--tail', '25', name], {
    encoding: 'utf8',
    windowsHide: true
  });
  console.error(logs.stdout, logs.stderr);
  throw error;
} finally {
  docker(['rm', '-f', name], false);
  docker(['volume', 'rm', volume], false);
}
