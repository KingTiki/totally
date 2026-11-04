import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonStore } from '../src/lib/server/store.ts';
import { ReminderWorker } from '../src/lib/server/scheduler.ts';
import { fixture, temporaryDirectory } from './helpers.ts';
import type { Delivery } from '../src/lib/model.ts';

test('SMTP failure persists, retries after restart, and successful daily mail is not repeated', async (t) => {
  const directory = await temporaryDirectory(t),
    store = new JsonStore(directory);
  await store.load();
  const db = fixture();
  db.settings.emailEnabled = true;
  await store.import(db);
  const sent: Delivery[] = [];
  const failing = new ReminderWorker(
    store,
    async () => {
      throw Object.assign(new Error('private credentials must not leak'), { code: 'ECONNECTION' });
    },
    'https://crm.example.test'
  );
  await failing.tick(new Date('2026-10-24T06:59:00Z'));
  assert.equal(store.snapshot().deliveries.length, 0);
  await failing.tick(new Date('2026-10-24T07:00:00Z'));
  const failed = store.snapshot().deliveries[0];
  assert.equal(failed.status, 'failed');
  assert.equal(failed.attempts, 1);
  assert(!failed.error?.includes('credentials'));
  const reopened = new JsonStore(directory);
  await reopened.load();
  const worker = new ReminderWorker(
    reopened,
    async (mail) => {
      sent.push(mail);
    },
    'https://crm.example.test'
  );
  await worker.tick(new Date('2026-10-24T07:04:00Z'));
  assert.equal(sent.length, 0);
  await worker.tick(new Date('2026-10-24T07:05:00Z'));
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Nach dem Gespräch fragen/);
  assert.match(sent[0].text, /https:\/\/crm.example.test\/personen\/lea/);
  assert.equal(reopened.snapshot().deliveries[0].status, 'sent');
  await worker.tick(new Date('2026-10-24T12:00:00Z'), true);
  assert.equal(sent.length, 1);
});
test('a persisted pending attempt is resumed and concurrent ticks send only once', async (t) => {
  const store = new JsonStore(await temporaryDirectory(t));
  await store.load();
  const db = fixture();
  db.settings.emailEnabled = true;
  await store.import(db);
  let sent = 0;
  let release!: () => void;
  let started!: () => void;
  const sending = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const worker = new ReminderWorker(
    store,
    async () => {
      sent++;
      started();
      await gate;
    },
    'https://crm.example.test'
  );
  const first = worker.tick(new Date('2026-10-24T08:00:00Z'));
  await sending;
  assert.equal(store.snapshot().deliveries[0].status, 'pending');
  await store.update((db) => {
    db.people[0].name = 'Lea, während des Versands bearbeitet';
  });
  await worker.tick(new Date('2026-10-24T08:00:00Z'));
  assert.equal(sent, 1);
  release();
  await first;
  assert.equal(store.snapshot().people[0].name, 'Lea, während des Versands bearbeitet');
  await store.update((d) => {
    d.deliveries[0].status = 'pending';
    d.deliveries[0].nextAttemptAt = '2026-10-24T08:00:00Z';
  });
  const resumed = new ReminderWorker(
    store,
    async () => {
      sent++;
    },
    'https://crm.example.test'
  );
  await resumed.tick(new Date('2026-10-24T08:10:00Z'));
  assert.equal(sent, 2);
});
test('disabled delivery and empty agendas do not send mail', async (t) => {
  const store = new JsonStore(await temporaryDirectory(t));
  await store.load();
  let sent = 0;
  const worker = new ReminderWorker(
    store,
    async () => {
      sent++;
    },
    'https://crm.example.test'
  );
  await worker.tick(new Date('2026-10-24T12:00:00Z'), true);
  assert.equal(store.snapshot().deliveries.length, 0);
  await store.update((db) => {
    db.settings.emailEnabled = true;
  });
  await worker.tick(new Date('2026-10-24T12:00:00Z'));
  assert.equal(store.snapshot().deliveries[0].status, 'skipped');
  assert.equal(sent, 0);
  const disabled = new ReminderWorker(
    store,
    async () => {
      sent++;
    },
    'https://crm.example.test',
    false
  );
  await disabled.tick(new Date('2026-10-25T12:00:00Z'));
  assert.equal(store.snapshot().deliveries.length, 1);
});
