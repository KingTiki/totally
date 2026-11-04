import { t } from './language.ts';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { agenda, namesFor } from '../agenda.ts';
import { formatDate, localClock } from '../dates.ts';
import type { Delivery } from '../model.ts';
import type { JsonStore } from './store.ts';
import { APP_NAME, APP_SLUG } from '../brand.ts';
import { withLanguage, currentLanguage } from './language.ts';
import type { Language } from '../i18n/index.ts';

export type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
};
export type SendMail = (delivery: Delivery) => Promise<void>;
type PushChannel = { tick(now: Date, force?: boolean): Promise<void> };
export function smtpConfigured(smtp: MailConfig): boolean {
  return !!(
    smtp.host &&
    smtp.from &&
    smtp.to &&
    Number.isInteger(smtp.port) &&
    smtp.port > 0 &&
    smtp.port <= 65535
  );
}
export function smtpSender(config: MailConfig): SendMail {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    disableFileAccess: true,
    disableUrlAccess: true
  });
  return async (delivery) => {
    const result = await transport.sendMail({
      from: config.from,
      to: config.to,
      subject: delivery.subject,
      text: delivery.text,
      messageId: `<${APP_SLUG}-${delivery.id}@${new URL(process.env.ORIGIN || 'http://localhost:3000').hostname}>`
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error('SMTP_RECIPIENT_REJECTED');
  };
}
export class ReminderWorker {
  private running = false;
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    privateStore: JsonStore,
    sender: SendMail,
    origin: string,
    configured = true,
    push?: PushChannel,
    language: () => Language = () => 'de'
  ) {
    this.language = language;
    this.store = privateStore;
    this.send = sender;
    this.origin = origin;
    this.configured = configured;
    this.push = push;
  }
  private store: JsonStore;
  private send: SendMail;
  private origin: string;
  private configured: boolean;
  private push?: PushChannel;
  private language: () => Language;

  start(): void {
    if (this.timer) return;
    const run = () => {
      void this.tick().catch((error) =>
        console.error('Erinnerungsdienst:', (error as Error).message)
      );
    };
    run();
    this.timer = setInterval(run, 60000);
    this.timer.unref();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  async tick(now = new Date(), force = false): Promise<void> {
    return withLanguage(this.language(), () => this.tickInLanguage(now, force));
  }
  private async tickInLanguage(now: Date, force: boolean): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const results = await Promise.allSettled([
        this.tickEmail(now, force),
        this.push?.tick(now, force)
      ]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    } finally {
      this.running = false;
    }
  }
  private async tickEmail(now: Date, force: boolean): Promise<void> {
    let db = this.store.snapshot();
    if (!db.settings.emailEnabled || !this.configured) return;
    const clock = localClock(now, db.settings.timezone),
      timestamp = now.toISOString();
    if (
      (force || clock.time >= db.settings.digestTime) &&
      !db.deliveries.some((d) => d.date === clock.date)
    ) {
      const items = agenda(db, clock.date, clock.date, true, currentLanguage());
      const lines = items.map((item) => {
        const people = namesFor(db, item.personIds)
          .map((p) => p.name)
          .join(', ');
        const link = item.personIds[0] ? `/personen/${item.personIds[0]}` : '/';
        return `• ${item.title}${people && item.kind !== 'birthday' ? ` · ${people}` : ''}\n  ${formatDate(item.date)} · ${item.detail}\n  ${this.origin}${link}`;
      });
      const delivery: Delivery = {
        id: randomUUID(),
        date: clock.date,
        status: items.length ? 'pending' : 'skipped',
        attempts: 0,
        nextAttemptAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        subject: t('Deine Übersicht für {p0} · {p1}', { p0: formatDate(clock.date), p1: APP_NAME }),
        text: t('Guten Morgen,\n\ndas steht an:\n\n{p0}\n\nAlles im Blick: {p1}\n', {
          p0: lines.join('\n\n'),
          p1: this.origin
        })
      };
      await this.store.update((draft) => {
        if (!draft.deliveries.some((d) => d.date === clock.date)) draft.deliveries.push(delivery);
        // Keep pending deliveries; retain the latest 100 completed summaries.
        const finished = draft.deliveries
          .filter((d) => ['sent', 'skipped'].includes(d.status))
          .sort((a, b) => b.date.localeCompare(a.date));
        const remove = new Set(finished.slice(100).map((d) => d.id));
        draft.deliveries = draft.deliveries.filter((d) => !remove.has(d.id));
      });
    }
    db = this.store.snapshot();
    const due = db.deliveries.filter(
      (d) => ['pending', 'failed'].includes(d.status) && d.nextAttemptAt <= timestamp
    );
    for (const delivery of due) {
      // Persist the attempt before SMTP. A crash after acceptance may cause a duplicate.
      const attempt = await this.store.update((draft) => {
        if (!draft.settings.emailEnabled) return undefined;
        const current = draft.deliveries.find((d) => d.id === delivery.id);
        if (
          !current ||
          !['pending', 'failed'].includes(current.status) ||
          current.nextAttemptAt > timestamp
        )
          return undefined;
        current.status = 'pending';
        current.attempts++;
        current.updatedAt = timestamp;
        current.nextAttemptAt = new Date(
          now.getTime() + Math.min(360, 5 * 2 ** Math.min(current.attempts - 1, 7)) * 60000
        ).toISOString();
        return current;
      });
      if (!attempt) continue;
      let failure: string | undefined;
      try {
        await this.send(attempt);
      } catch (error) {
        const code = (error as { code?: string }).code;
        failure = t(
          'SMTP-Versand fehlgeschlagen{p0}. Bitte SMTP-Konfiguration und Empfänger prüfen.',
          { p0: code && /^[A-Z0-9_]{1,40}$/.test(code) ? ` (${code})` : '' }
        );
      }
      await this.store.update((draft) => {
        const current = draft.deliveries.find((d) => d.id === attempt.id);
        if (!current) return;
        current.status = failure ? 'failed' : 'sent';
        current.updatedAt = timestamp;
        if (failure) current.error = failure;
        else delete current.error;
      });
    }
  }
}
