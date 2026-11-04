import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JsonStore } from '../src/lib/server/store.ts';
import { pushStore, PushWorker, normalizeSubscription } from '../src/lib/server/push.ts';
import type { PushPayload } from '../src/lib/push-payload.ts';
import { ReminderWorker } from '../src/lib/server/scheduler.ts';
import { notificationPayload, safeNotificationUrl } from '../src/lib/push-payload.ts';
import { fixture, temporaryDirectory } from './helpers.ts';

function subscription(name = 'phone') {
  const curve = createECDH('prime256v1');
  curve.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
    expirationTime: null,
    keys: {
      p256dh: curve.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url')
    }
  };
}
async function stores(t: Parameters<typeof temporaryDirectory>[0]) {
  const directory = await temporaryDirectory(t),
    db = new JsonStore(directory),
    state = pushStore(directory);
  await db.load();
  await db.import(fixture());
  await state.load();
  return { directory, db, state };
}
test('push keys persist privately and duplicate subscriptions update the existing device', async (t) => {
  const { directory, db, state } = await stores(t),
    worker = new PushWorker(state, db, async () => {}),
    sub = subscription();
  const id = await worker.subscribe(sub, 'Mein iPhone');
  assert.equal(await worker.subscribe(sub, 'iPhone umbenannt'), id);
  assert.equal(state.snapshot().devices.length, 1);
  const reopened = pushStore(directory);
  await reopened.load();
  assert.equal(reopened.snapshot().privateKey, state.snapshot().privateKey);
  const exported = JSON.stringify(db.snapshot());
  assert(!exported.includes(sub.endpoint));
  assert(!exported.includes(state.snapshot().privateKey));
  assert(!(await readFile(join(directory, 'data.json'), 'utf8')).includes('publicKey'));
});
test('subscriptions reject arbitrary servers, invalid encryption keys and credentials in URLs', () => {
  const sub = subscription();
  assert.throws(
    () => normalizeSubscription({ ...sub, endpoint: 'https://127.0.0.1/private' }),
    /nicht unterstützt/
  );
  assert.throws(
    () => normalizeSubscription({ ...sub, endpoint: 'https://fcm.googleapis.com.evil.test/push' }),
    /nicht unterstützt/
  );
  assert.throws(
    () =>
      normalizeSubscription({ ...sub, endpoint: 'https://user:password@fcm.googleapis.com/push' }),
    /nicht unterstützt/
  );
  assert.throws(
    () => normalizeSubscription({ ...sub, keys: { ...sub.keys, auth: 'bad' } }),
    /Schlüssel/
  );
  assert.doesNotThrow(() =>
    normalizeSubscription({ ...sub, endpoint: 'https://web.push.apple.com/device' })
  );
  assert.doesNotThrow(() =>
    normalizeSubscription({
      ...sub,
      endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/device'
    })
  );
});
test('push works with email disabled and sends one private digest per device and day', async (t) => {
  const { db, state } = await stores(t),
    sent: PushPayload[] = [];
  const push = new PushWorker(state, db, async (_, payload) => {
    sent.push(payload);
  });
  await push.subscribe(subscription('android'), 'Android');
  await push.subscribe(subscription('iphone'), 'iPhone');
  const worker = new ReminderWorker(
    db,
    async () => {
      assert.fail('SMTP is disabled');
    },
    'https://crm.example.test',
    false,
    push
  );
  await worker.tick(new Date('2026-10-24T06:59:00Z'));
  assert.equal(sent.length, 0);
  await Promise.all([
    worker.tick(new Date('2026-10-24T07:00:00Z')),
    worker.tick(new Date('2026-10-24T07:00:00Z'))
  ]);
  assert.equal(sent.length, 2);
  assert.match(sent[0].body, /Eine Erinnerung/);
  assert(!JSON.stringify(sent).includes('Lea'));
  assert.equal(state.snapshot().deliveries.filter((d) => d.status === 'sent').length, 2);
  await worker.tick(new Date('2026-10-24T10:00:00Z'), true);
  assert.equal(sent.length, 2);
  await state.update((draft) => {
    draft.deliveries = [];
  });
  await worker.tick(new Date('2026-10-24T11:00:00Z'), true);
  assert.equal(sent.length, 2, 'rotating history must not reset daily deduplication');
});
test('failed push retries after restart and removed devices stop receiving', async (t) => {
  const { directory, db, state } = await stores(t);
  const broken = new PushWorker(state, db, async () => {
    throw { statusCode: 503, body: 'secret endpoint text' };
  });
  const id = await broken.subscribe(subscription(), 'Android');
  await broken.tick(new Date('2026-10-24T07:00:00Z'));
  assert.equal(state.snapshot().deliveries[0].status, 'failed');
  assert(!state.snapshot().deliveries[0].error?.includes('secret'));
  const reopened = pushStore(directory);
  await reopened.load();
  let sent = 0;
  const recovered = new PushWorker(reopened, db, async () => {
    sent++;
  });
  await recovered.tick(new Date('2026-10-24T07:04:00Z'));
  assert.equal(sent, 0);
  await recovered.tick(new Date('2026-10-24T07:05:00Z'));
  assert.equal(sent, 1);
  await recovered.remove(id);
  await recovered.tick(new Date('2026-10-25T10:00:00Z'));
  assert.equal(sent, 1);
});
test('an empty day does not consume the push window before the first reminder is created', async (t) => {
  const { db, state } = await stores(t);
  let sent = 0;
  await db.update((draft) => {
    draft.reminders = [];
  });
  const worker = new PushWorker(state, db, async () => {
    sent++;
  });
  await worker.subscribe(subscription(), 'Telefon');
  await worker.tick(new Date('2026-10-24T08:00:00Z'));
  assert.equal(state.snapshot().deliveries.length, 0);
  await db.update((draft) => {
    draft.reminders = fixture().reminders;
  });
  await worker.tick(new Date('2026-10-24T08:01:00Z'));
  assert.equal(sent, 1);
});
test('expired subscriptions are removed without blocking a second device', async (t) => {
  const { db, state } = await stores(t);
  const worker = new PushWorker(state, db, async (device) => {
    if (device.label === 'Alt') throw { statusCode: 410 };
  });
  await worker.subscribe(subscription('old'), 'Alt');
  await worker.subscribe(subscription('new'), 'Neu');
  await worker.tick(new Date('2026-10-24T08:00:00Z'));
  assert.equal(state.snapshot().devices.length, 1);
  assert.equal(state.snapshot().devices[0].label, 'Neu');
  assert.deepEqual(
    state
      .snapshot()
      .deliveries.map((d) => d.status)
      .sort(),
    ['expired', 'sent']
  );
});
test('test messages are independent of the digest, rate limited and have no personal content', async (t) => {
  const { db, state } = await stores(t),
    push = new PushWorker(state, db, async () => {});
  const id = await push.subscribe(subscription(), 'Telefon');
  await push.test(id, new Date('2026-10-24T08:00:00Z'));
  await assert.rejects(push.test(id, new Date('2026-10-24T08:00:01Z')), /30 Sekunden/);
  await push.tick(new Date('2026-10-24T08:01:00Z'));
  assert.deepEqual(
    state
      .snapshot()
      .deliveries.map((d) => d.kind)
      .sort(),
    ['digest', 'test']
  );
});
test('push payload parsing tolerates missing data and never navigates to another origin', () => {
  assert.equal(notificationPayload(null).title, 'totally!');
  assert.equal(notificationPayload({ title: 'a'.repeat(300) }).title.length, 120);
  assert.equal(
    safeNotificationUrl('//evil.test/path', 'https://crm.example.test'),
    'https://crm.example.test/'
  );
  assert.equal(
    safeNotificationUrl('javascript:alert(1)', 'https://crm.example.test'),
    'https://crm.example.test/'
  );
  assert.equal(
    safeNotificationUrl('/personen/lea', 'https://crm.example.test'),
    'https://crm.example.test/personen/lea'
  );
});
