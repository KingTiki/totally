import { t } from './language.ts';
import { randomUUID, createECDH, ECDH } from 'node:crypto';
import { join } from 'node:path';
import webpush from 'web-push';
import { JsonFileStore, type JsonStore } from './store.ts';
import { agenda } from '../agenda.ts';
import { isDate, localClock } from '../dates.ts';
import type { PushPayload } from '../push-payload.ts';
import { APP_NAME } from '../brand.ts';
import { withLanguage } from './language.ts';
import type { Language } from '../i18n/index.ts';

export type BrowserSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};
export type PushDevice = BrowserSubscription & {
  id: string;
  label: string;
  createdAt: string;
  lastSuccessAt?: string;
  lastDigestDate?: string;
  error?: string;
};
export type PushDelivery = {
  id: string;
  deviceId: string;
  deviceLabel: string;
  date: string;
  kind: 'digest' | 'test';
  status: 'pending' | 'sent' | 'failed' | 'expired' | 'skipped';
  attempts: number;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  payload: PushPayload;
  error?: string;
};
export type PushState = {
  schemaVersion: 1;
  publicKey: string;
  privateKey: string;
  devices: PushDevice[];
  deliveries: PushDelivery[];
};
function ensure(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function record(value: unknown): Record<string, unknown> {
  ensure(value && typeof value === 'object' && !Array.isArray(value), t('Ungültige Push-Daten.'));
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function keyBytes(value: unknown, length: number): Buffer {
  ensure(
    typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value),
    t('Ungültiger Push-Schlüssel.')
  );
  const decoded = Buffer.from(value, 'base64url');
  ensure(
    decoded.length === length && decoded.toString('base64url') === value,
    t('Ungültiger Push-Schlüssel.')
  );
  return decoded;
}
export function normalizeSubscription(input: unknown): BrowserSubscription {
  const value = record(input),
    keys = record(value.keys);
  ensure(
    typeof value.endpoint === 'string' && value.endpoint.length <= 4096,
    t('Ungültiger Push-Endpunkt.')
  );
  const url = new URL(value.endpoint);
  // Only known browser push services can be registered, never arbitrary server URLs.
  const host = url.hostname.toLowerCase();
  const supported =
    ['fcm.googleapis.com', 'android.googleapis.com', 'web.push.apple.com'].includes(host) ||
    host.endsWith('.push.services.mozilla.com') ||
    host.endsWith('.notify.windows.com');
  ensure(
    supported &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (!url.port || url.port === '443'),
    t('Dieser Browser-Push-Dienst wird nicht unterstützt.')
  );
  const publicKey = keyBytes(keys.p256dh, 65);
  ensure(publicKey[0] === 4, t('Ungültiger Geräteschlüssel.'));
  try {
    ECDH.convertKey(publicKey, 'prime256v1');
  } catch {
    throw new Error(t('Ungültiger Geräteschlüssel.'));
  }
  keyBytes(keys.auth, 16);
  ensure(
    value.expirationTime == null ||
      (typeof value.expirationTime === 'number' && Number.isFinite(value.expirationTime)),
    t('Ungültiges Ablaufdatum.')
  );
  return {
    endpoint: url.href,
    expirationTime: value.expirationTime == null ? null : (value.expirationTime as number),
    keys: { p256dh: keys.p256dh as string, auth: keys.auth as string }
  };
}
export function validatePushState(input: unknown): PushState {
  const state = record(input);
  ensure(state.schemaVersion === 1, t('Unbekannte Push-Dateiversion.'));
  const publicKey = keyBytes(state.publicKey, 65),
    privateKey = keyBytes(state.privateKey, 32);
  const curve = createECDH('prime256v1');
  curve.setPrivateKey(privateKey);
  ensure(
    curve.getPublicKey().equals(publicKey),
    t('Die gespeicherten Push-Schlüssel passen nicht zusammen.')
  );
  ensure(
    Array.isArray(state.devices) &&
      state.devices.length <= 50 &&
      Array.isArray(state.deliveries) &&
      state.deliveries.length <= 10000,
    t('Ungültige Push-Listen.')
  );
  const ids = new Set<string>(),
    endpoints = new Set<string>(),
    days = new Set<string>();
  for (const raw of state.devices) {
    const device = record(raw),
      normalized = normalizeSubscription(device);
    ensure(
      typeof device.id === 'string' &&
        /^[a-zA-Z0-9_-]{1,100}$/.test(device.id) &&
        !ids.has(device.id),
      t('Ungültige Geräte-ID.')
    );
    ensure(
      typeof device.label === 'string' &&
        device.label.trim().length > 0 &&
        device.label.length <= 80 &&
        timestamp(device.createdAt),
      t('Ungültiger Gerätename oder Zeitstempel.')
    );
    ensure(
      device.lastSuccessAt === undefined || timestamp(device.lastSuccessAt),
      t('Ungültiger Push-Zeitstempel.')
    );
    ensure(
      device.lastDigestDate === undefined || isDate(device.lastDigestDate),
      t('Ungültiger Tagesübersicht-Status.')
    );
    ensure(
      device.error === undefined ||
        (typeof device.error === 'string' && device.error.length <= 500),
      t('Ungültiger Push-Fehler.')
    );
    ensure(!endpoints.has(normalized.endpoint), t('Gerät wurde doppelt gespeichert.'));
    ids.add(device.id);
    endpoints.add(normalized.endpoint);
  }
  for (const raw of state.deliveries) {
    const d = record(raw),
      payload = record(d.payload);
    ensure(
      typeof d.id === 'string' && !ids.has(d.id) && /^[a-zA-Z0-9_-]{1,100}$/.test(d.id),
      t('Ungültige Push-Zustellungs-ID.')
    );
    ids.add(d.id);
    ensure(
      typeof d.deviceId === 'string' &&
        typeof d.deviceLabel === 'string' &&
        d.deviceLabel.length <= 80 &&
        isDate(d.date),
      t('Ungültiger Push-Empfänger.')
    );
    ensure(
      ['digest', 'test'].includes(String(d.kind)) &&
        ['pending', 'sent', 'failed', 'expired', 'skipped'].includes(String(d.status)),
      t('Ungültiger Push-Status.')
    );
    ensure(
      Number.isInteger(d.attempts) &&
        Number(d.attempts) >= 0 &&
        timestamp(d.nextAttemptAt) &&
        timestamp(d.createdAt) &&
        timestamp(d.updatedAt),
      t('Ungültiger Zustellversuch.')
    );
    ensure(
      typeof payload.title === 'string' &&
        payload.title.length <= 120 &&
        typeof payload.body === 'string' &&
        payload.body.length <= 1500 &&
        typeof payload.url === 'string' &&
        payload.url === '/' &&
        typeof payload.tag === 'string' &&
        payload.tag.length <= 120,
      t('Ungültiger Push-Inhalt.')
    );
    ensure(
      d.error === undefined || (typeof d.error === 'string' && d.error.length <= 500),
      t('Ungültiger Zustellfehler.')
    );
    if (d.kind === 'digest') {
      const key = `${d.deviceId}:${d.date}`;
      ensure(!days.has(key), t('Doppelte Push-Tagesübersicht.'));
      days.add(key);
    }
  }
  return structuredClone(state) as PushState;
}
export function createPushState(): PushState {
  return { schemaVersion: 1, ...webpush.generateVAPIDKeys(), devices: [], deliveries: [] };
}
export function pushStore(directory: string) {
  return new JsonFileStore<PushState>(join(directory, 'push'), validatePushState, createPushState);
}
export type PushSender = (
  device: PushDevice,
  payload: PushPayload,
  keys: { publicKey: string; privateKey: string }
) => Promise<void>;
export function browserPushSender(origin: string): PushSender {
  return async (device, payload, keys) => {
    await webpush.sendNotification(device, JSON.stringify(payload), {
      vapidDetails: {
        ...keys,
        subject: origin.startsWith('https:') ? origin : 'mailto:admin@localhost'
      },
      TTL: 86400,
      urgency: 'normal',
      timeout: 15000
    });
  };
}
export class PushWorker {
  private state: JsonFileStore<PushState>;
  private db: JsonStore;
  private send: PushSender;
  private running = false;
  private language: () => Language;
  constructor(
    state: JsonFileStore<PushState>,
    db: JsonStore,
    send: PushSender,
    language: () => Language = () => 'de'
  ) {
    this.language = language;
    this.state = state;
    this.db = db;
    this.send = send;
  }
  async subscribe(input: unknown, label: unknown): Promise<string> {
    const subscription = normalizeSubscription(input);
    ensure(
      typeof label === 'string' && label.trim().length > 0 && label.trim().length <= 80,
      t('Bitte einen Gerätenamen mit maximal 80 Zeichen angeben.')
    );
    return this.state.update((state) => {
      const existing = state.devices.find((d) => d.endpoint === subscription.endpoint);
      if (existing) {
        Object.assign(existing, subscription, { label: label.trim() });
        delete existing.error;
        return existing.id;
      }
      ensure(state.devices.length < 50, t('Maximal 50 Geräte können verbunden werden.'));
      const device = {
        ...subscription,
        id: randomUUID(),
        label: label.trim(),
        createdAt: new Date().toISOString()
      };
      state.devices.push(device);
      return device.id;
    });
  }
  async remove(id: string): Promise<void> {
    await this.state.update((state) => {
      state.devices = state.devices.filter((d) => d.id !== id);
      for (const delivery of state.deliveries)
        if (delivery.deviceId === id && ['pending', 'failed'].includes(delivery.status)) {
          delivery.status = 'expired';
          delivery.error = t('Gerät wurde getrennt.');
        }
    });
  }
  async test(id: string, now = new Date()): Promise<void> {
    return withLanguage(this.language(), () => this.testInLanguage(id, now));
  }
  private async testInLanguage(id: string, now: Date): Promise<void> {
    const jobId = await this.state.update((state) => {
      const device = state.devices.find((d) => d.id === id);
      ensure(device, t('Dieses Gerät ist nicht mehr verbunden.'));
      ensure(
        !state.deliveries.some(
          (d) =>
            d.deviceId === id &&
            d.kind === 'test' &&
            Date.parse(d.createdAt) > now.getTime() - 30000
        ),
        t('Bitte vor einer weiteren Testnachricht 30 Sekunden warten.')
      );
      const job = this.job(
        device,
        'test',
        localClock(now, this.db.snapshot().settings.timezone).date,
        {
          title: t('Das hat geklappt · {p0}', { p0: APP_NAME }),
          body: t('Push ist eingerichtet. Deine Erinnerungen kommen künftig auf diesem Gerät an.'),
          url: '/',
          tag: `nahbei-test-${randomUUID()}`
        },
        now
      );
      state.deliveries.push(job);
      this.prune(state);
      return job.id;
    });
    await this.deliver(jobId, now);
    const result = this.state.snapshot().deliveries.find((d) => d.id === jobId);
    if (result?.status !== 'sent')
      throw new Error(result?.error || t('Testnachricht konnte nicht versendet werden.'));
  }
  private job(
    device: PushDevice,
    kind: 'digest' | 'test',
    date: string,
    payload: PushPayload,
    now: Date
  ): PushDelivery {
    return {
      id: randomUUID(),
      deviceId: device.id,
      deviceLabel: device.label,
      date,
      kind,
      payload,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
  }
  private prune(state: PushState) {
    const finished = state.deliveries
      .filter((d) => !['pending', 'failed'].includes(d.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const remove = new Set(finished.slice(200).map((d) => d.id));
    state.deliveries = state.deliveries.filter((d) => !remove.has(d.id));
  }
  async tick(now = new Date(), force = false): Promise<void> {
    return withLanguage(this.language(), () => this.tickInLanguage(now, force));
  }
  private async tickInLanguage(now: Date, force: boolean): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const db = this.db.snapshot(),
        clock = localClock(now, db.settings.timezone);
      const snapshot = this.state.snapshot();
      const newDigest = snapshot.devices.some(
        (device) =>
          device.lastDigestDate !== clock.date &&
          !snapshot.deliveries.some(
            (d) => d.deviceId === device.id && d.kind === 'digest' && d.date === clock.date
          )
      );
      if (
        newDigest &&
        (force || clock.time >= db.settings.digestTime) &&
        agenda(db, clock.date, clock.date, true).length > 0
      ) {
        const count = agenda(db, clock.date, clock.date, true).length;
        const payload: PushPayload = {
          title: t('Deine Erinnerungen · {p0}', { p0: APP_NAME }),
          body: t('{p0} auf dich. Öffne {p1} für die Details.', {
            p0:
              count === 1
                ? t('Eine Erinnerung wartet')
                : t('{p0} Erinnerungen warten', { p0: count }),
            p1: APP_NAME
          }),
          url: '/',
          tag: `nahbei-digest-${clock.date}`
        };
        await this.state.update((state) => {
          for (const device of state.devices) {
            if (
              device.lastDigestDate === clock.date ||
              state.deliveries.some(
                (d) => d.deviceId === device.id && d.kind === 'digest' && d.date === clock.date
              )
            )
              continue;
            const job = this.job(device, 'digest', clock.date, payload, now);
            device.lastDigestDate = clock.date;
            if (!count) job.status = 'skipped';
            state.deliveries.push(job);
          }
          this.prune(state);
        });
      }
      for (const job of this.state
        .snapshot()
        .deliveries.filter(
          (d) => ['pending', 'failed'].includes(d.status) && d.nextAttemptAt <= now.toISOString()
        ))
        await this.deliver(job.id, now);
    } finally {
      this.running = false;
    }
  }
  private async deliver(id: string, now: Date): Promise<void> {
    const attempt = await this.state.update((state) => {
      const job = state.deliveries.find((d) => d.id === id);
      if (
        !job ||
        !['pending', 'failed'].includes(job.status) ||
        job.nextAttemptAt > now.toISOString()
      )
        return undefined;
      const device = state.devices.find((d) => d.id === job.deviceId);
      if (!device) {
        job.status = 'expired';
        job.error = t('Gerät wurde getrennt.');
        return undefined;
      }
      job.status = 'pending';
      job.attempts++;
      job.updatedAt = now.toISOString();
      job.nextAttemptAt = new Date(
        now.getTime() + Math.min(360, 5 * 2 ** Math.min(job.attempts - 1, 7)) * 60000
      ).toISOString();
      return { job, device, keys: { publicKey: state.publicKey, privateKey: state.privateKey } };
    });
    if (!attempt) return;
    let statusCode = 0,
      failed = false;
    try {
      await this.send(attempt.device, attempt.job.payload, attempt.keys);
    } catch (error) {
      failed = true;
      statusCode = Number((error as { statusCode?: number }).statusCode) || 0;
    }
    await this.state.update((state) => {
      const job = state.deliveries.find((d) => d.id === id);
      if (!job) return;
      if (job.status === 'expired') return;
      const expired = [404, 410].includes(statusCode);
      job.status = expired ? 'expired' : failed ? 'failed' : 'sent';
      job.updatedAt = now.toISOString();
      if (failed)
        job.error = expired
          ? t('Die Gerätefreigabe ist abgelaufen. Bitte auf dem Gerät erneut aktivieren.')
          : t('Push-Versand fehlgeschlagen{p0}. Ein erneuter Versuch folgt automatisch.', {
              p0: statusCode ? ` (HTTP ${statusCode})` : ''
            });
      else delete job.error;
      const device = state.devices.find((d) => d.id === job.deviceId);
      if (device) {
        if (failed) device.error = job.error;
        else {
          device.lastSuccessAt = now.toISOString();
          delete device.error;
        }
      }
      if (expired) {
        state.devices = state.devices.filter((d) => d.id !== job.deviceId);
        for (const other of state.deliveries)
          if (other.deviceId === job.deviceId && ['pending', 'failed'].includes(other.status)) {
            other.status = 'expired';
            other.error = job.error;
          }
      }
    });
  }
}
