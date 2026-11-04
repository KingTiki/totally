<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import type { Person } from '#lib/model';
  import { enhanceForm } from '#lib/client';
  let {
    people,
    today,
    selected = [],
    date,
    onsaved
  }: {
    people: Person[];
    today: string;
    selected?: string[];
    date?: string;
    onsaved?: () => void;
  } = $props();
  let recurrence = $state('once'),
    error = $state(''),
    busy = $state(false);
</script>

<form
  method="POST"
  action="?/create"
  use:enhanceForm={{ onsaved, onerror: (m) => (error = m), onbusy: (b) => (busy = b) }}
  class="form-stack"
>
  {#if error}<p class="notice error" role="alert">{error}</p>{/if}
  <label
    >{t('Woran möchtest du denken?')}
    <input
      name="title"
      required
      maxlength="500"
      placeholder={t('Nach dem Vorstellungsgespräch fragen')}
    /></label
  >
  <label
    >{t('Wiederholung')}
    <select name="recurrence" bind:value={recurrence}
      ><option value="once">{t('Einmalig')}</option><option value="annual"
        >{t('Jährlich · Geburtstag, Jahrestag, Anlass')}</option
      ><option value="interval">{t('Regelmäßig Kontakt halten')}</option></select
    ></label
  >
  <fieldset>
    <legend
      >{t('Personen')}
      <span class="muted"
        >· {recurrence === 'interval' ? t('genau eine auswählen') : 'optional'}</span
      ></legend
    >
    <div class="person-picker">
      {#each people.toSorted((a, b) => a.name.localeCompare(b.name, 'de')) as person}<label
          class="check-option"
          ><input
            type="checkbox"
            name="personIds"
            value={person.id}
            checked={selected.includes(person.id)}
          />{person.name}</label
        >{/each}
    </div>
  </fieldset>
  {#if recurrence === 'interval'}<label
      >{t('Kontakt ungefähr alle … Tage')}
      <input type="number" name="intervalDays" min="1" max="3650" value="56" required /></label
    >
    <p class="field-help">
      {t(
        'Der nächste Termin richtet sich nach dem letzten erfassten Kontakt. Ohne bisherigen Kontakt beginnt der Zeitraum heute.'
      )}
    </p>
  {:else}<label
      >{recurrence === 'annual' ? t('Erster Termin') : t('Datum')}
      <input lang="de" type="date" name="date" value={date || today} required /></label
    >{/if}
  <div class="form-footer">
    <span></span><button class="button primary" disabled={busy}
      >{busy ? t('Speichert …') : t('Erinnerung anlegen')}</button
    >
  </div>
</form>
