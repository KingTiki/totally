<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { untrack } from 'svelte';
  import type { Reminder } from '#lib/model';
  import { enhanceForm } from '#lib/client';
  import { rhythmLabel } from '#lib/contact-rhythm';
  let { rhythm, count, onsaved }: { rhythm?: Reminder; count: number; onsaved: () => void } =
    $props();
  let days = $state<number | undefined>(untrack(() => rhythm?.intervalDays ?? 28));
  let error = $state(''),
    busy = $state(false);
</script>

<form
  method="POST"
  action="?/rhythm"
  use:enhanceForm={{
    onsaved,
    onerror: (message) => (error = message),
    onbusy: (value) => (busy = value)
  }}
  class="form-stack"
>
  <input type="hidden" name="operation" value="save" />
  {#if error}<p class="notice error" role="alert">{error}</p>{/if}
  <p class="muted small">{t('Lege fest, in welchem Abstand du dich ungefähr melden möchtest.')}</p>
  <label
    >{t('Kontakt ungefähr alle … Tage')}
    <input type="number" name="intervalDays" min="1" max="3650" required bind:value={days} /></label
  >
  <div class="rhythm-presets" aria-label={t('Häufige Abstände')}>
    {#each [14, 28, 56, 84] as preset}<button
        type="button"
        class="button secondary small-button"
        class:chosen={days === preset}
        aria-pressed={days === preset}
        onclick={() => (days = preset)}>{rhythmLabel(preset, t.language())}</button
      >{/each}
  </div>
  <p class="field-help">
    {t(
      'Der Abstand läuft ab dem letzten Kontakt. Ohne bisherigen Kontakt startet er heute. Beim Ändern bleibt der Beginn des aktuellen Zeitraums erhalten.'
    )}
  </p>
  {#if rhythm?.state === 'paused'}<p class="notice info">
      {t('Der Rhythmus bleibt pausiert, bis du ihn im Profil fortsetzt.')}
    </p>{/if}
  {#if count > 1}<p class="notice info">
      {t('Die bisherigen')}
      {count}
      {t(
        'Kontaktintervalle werden durch diesen Rhythmus ersetzt. Ihre Einträge bleiben im Datenbestand erhalten.'
      )}
    </p>{/if}
  <div class="form-footer">
    <span></span><button class="button primary" disabled={busy}
      >{busy ? t('Speichert …') : t('Rhythmus speichern')}</button
    >
  </div>
</form>
{#if rhythm}<form
    method="POST"
    action="?/rhythm"
    use:enhanceForm={{
      onsaved,
      onerror: (message) => (error = message),
      onbusy: (value) => (busy = value)
    }}
    class="rhythm-disable"
  >
    <input type="hidden" name="operation" value="off" /><button class="text-button" disabled={busy}
      >{t('Kontaktrhythmus ausschalten')}</button
    >
  </form>{/if}
