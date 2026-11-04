import { t } from '../../lib/server/language.ts';
import { runtime } from '#lib/server/runtime';
import { perform, saveSettings } from '#lib/server/actions';
import { smtpConfigured } from '#lib/server/scheduler';
import { readBackup } from '#lib/server/backup';
import { BACKUP_MAX_BYTES } from '#lib/backup';
import { redirect } from '@sveltejs/kit';
import { isLanguage } from '#lib/i18n/index';
export async function load() {
  const { store, config, pushState } = await runtime(),
    db = store.snapshot();
  const push = pushState.snapshot();
  return {
    trashCount: db.people.filter((person) => person.deletedAt).length,
    settings: db.settings,
    smtpConfigured: smtpConfigured(config.smtp),
    recipient: config.smtp.to,
    pushPublicKey: push.publicKey,
    devices: push.devices.map(({ id, label, createdAt, lastSuccessAt, error }) => ({
      id,
      label,
      createdAt,
      lastSuccessAt,
      error
    })),
    pushDeliveries: push.deliveries
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20),
    deliveries: db.deliveries
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
  };
}
export const actions = {
  language: async ({ request }: import('./$types').RequestEvent) => {
    const result = await perform(async () => {
      const language = (await request.formData()).get('language');
      if (!isLanguage(language)) throw new Error(t('Bitte Englisch oder Deutsch auswählen.'));
      const { preferences } = await runtime();
      await preferences.update((draft) => {
        draft.language = language;
      });
    });
    if ('success' in result) redirect(303, '/einstellungen');
    return result;
  },
  removePush: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => {
      const { push } = await runtime(),
        form = await request.formData();
      await push.remove(String(form.get('id') || ''));
    }, t('Gerät getrennt.')),
  save: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => saveSettings(await request.formData()), t('Einstellungen gespeichert.')),
  send: async () =>
    perform(async () => {
      const { worker, store, config, pushState } = await runtime();
      if (
        (!store.snapshot().settings.emailEnabled || !smtpConfigured(config.smtp)) &&
        !pushState.snapshot().devices.length
      )
        throw new Error(t('Bitte ein Push-Gerät verbinden oder E-Mail-Versand einrichten.'));
      await worker.tick(new Date(), true);
    }, t('Versand geprüft. Den aktuellen Status findest du unten.')),
  retry: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => {
      const { store, worker } = await runtime(),
        form = await request.formData();
      const id = String(form.get('id'));
      await store.update((db) => {
        const delivery = db.deliveries.find((d) => d.id === id && d.status === 'failed');
        if (!delivery) throw new Error(t('Kein fehlgeschlagener Versand gefunden.'));
        delivery.nextAttemptAt = new Date().toISOString();
      });
      await worker.tick();
    }, t('Zustellversuch gestartet.')),
  import: async ({ request }: import('./$types').RequestEvent) =>
    perform(async () => {
      const form = await request.formData(),
        file = form.get('file');
      if (form.get('confirm') !== 'on')
        throw new Error(t('Bitte das Ersetzen des Datenbestands bestätigen.'));
      if (!(file instanceof File) || file.size === 0 || file.size > BACKUP_MAX_BYTES)
        throw new Error(t('Bitte eine ZIP- oder JSON-Sicherung mit maximal 100 MiB auswählen.'));
      const input = readBackup(new Uint8Array(await file.arrayBuffer()));
      const { store } = await runtime();
      if (input.photos) await store.restore(input.data, input.photos);
      else await store.import(input.data);
    }, t('Daten importiert. Der vorherige Stand wurde gesichert.'))
};
