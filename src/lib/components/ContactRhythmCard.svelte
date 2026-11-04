<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import type { Reminder } from '#lib/model';
  import { formatDate } from '#lib/dates';
  import { rhythmLabel } from '#lib/contact-rhythm';
  import { enhanceForm } from '#lib/client';
  import Icon from './Icon.svelte';
  let {
    rhythm,
    count,
    today,
    onedit
  }: { rhythm?: Reminder; count: number; today: string; onedit: () => void } = $props();
  let error = $state(''),
    busy = $state(false);
  const next = $derived(
    rhythm?.snooze?.occurrence === rhythm?.date ? rhythm?.snooze?.date : rhythm?.date
  );
</script>

<section class="panel detail-card rhythm-card" aria-label={t('Kontaktrhythmus')}>
  <div class="section-heading">
    <h3><Icon name="clock" size={16} />{t('Kontaktrhythmus')}</h3>
    {#if rhythm}<button class="text-button" onclick={onedit}>{t('Ändern')}</button>{/if}
  </div>
  {#if error}<p class="notice error" role="alert">{error}</p>{/if}
  {#if rhythm}
    <p class="rhythm-interval">{rhythmLabel(rhythm.intervalDays!, t.language())}</p>
    {#if rhythm.state === 'paused'}<span class="tag">{t('Pausiert')}</span>
    {:else if next}<p class="rhythm-next" class:rhythm-overdue={next < today}>
        {next < today
          ? t('Überfällig seit')
          : next === today
            ? t('Heute wieder melden')
            : t('Nächster Kontakt:')}
        {#if next !== today}<time datetime={next}>{formatDate(next)}</time>{/if}
      </p>{/if}
    {#if rhythm.snooze && rhythm.state !== 'paused'}<p class="field-help">
        {t('Für diesen Kontakt verschoben.')}
      </p>{/if}
    {#if count > 1}<p class="field-help">
        {t('Es bestehen')}
        {count}
        {t(
          'Kontaktintervalle. Beim Speichern oder Fortsetzen werden sie zu einem Rhythmus zusammengeführt.'
        )}
      </p>{/if}
    <form
      method="POST"
      action="?/rhythm"
      use:enhanceForm={{
        onerror: (message) => (error = message),
        onbusy: (value) => (busy = value)
      }}
      class="rhythm-toggle"
    >
      <input
        type="hidden"
        name="operation"
        value={rhythm.state === 'paused' ? 'resume' : 'pause'}
      />
      <button class="text-button" disabled={busy}
        ><Icon name={rhythm.state === 'paused' ? 'arrow' : 'pause'} size={14} />{rhythm.state ===
        'paused'
          ? t('Fortsetzen')
          : t('Pausieren')}</button
      >
    </form>
  {:else}<p class="muted small">{t('Wie oft möchtest du mit dieser Person Kontakt haben?')}</p>
    <button class="button secondary small-button" onclick={onedit}
      >{t('Kontaktrhythmus festlegen')}</button
    >{/if}
  <p class="field-help rhythm-explanation">
    {t('Ein erfasster Kontakt startet den Zeitraum neu. Eine Notiz zählt nicht als Kontakt.')}
  </p>
</section>
