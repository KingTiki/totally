<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import type { Person } from '#lib/model';
  import { enhanceForm } from '#lib/client';
  import { untrack } from 'svelte';
  import PhotoPicker from './PhotoPicker.svelte';
  import TagPicker from './TagPicker.svelte';
  import { photoSource } from '#lib/photo';
  let {
    person,
    action,
    onsaved,
    availableTags = []
  }: { person?: Person; action: string; onsaved?: () => void; availableTags?: string[] } = $props();
  let error = $state(''),
    busy = $state(false);
  let photo = $state(untrack(() => (person ? photoSource(person) || '' : ''))),
    photoBusy = $state(false);
  let tags = $state(untrack(() => [...(person?.tags || [])]));
</script>

<form
  method="POST"
  {action}
  use:enhanceForm={{ onsaved, onerror: (m) => (error = m), onbusy: (b) => (busy = b) }}
  class="form-stack"
>
  {#if error}<p class="notice error" role="alert">{error}</p>{/if}
  <PhotoPicker name={person?.name || ''} bind:photo bind:busy={photoBusy} />
  <label
    >{t('Name')}
    <input
      name="name"
      required
      maxlength="200"
      value={person?.name || ''}
      autocomplete="name"
      placeholder={t('Vor- und Nachname')}
    /></label
  >
  <label
    >{t('Kontext')}
    <input
      name="context"
      value={person?.context || ''}
      placeholder={t('Zum Beispiel: Freundin aus dem Studium')}
      maxlength="500"
    /></label
  >
  <div class="form-grid">
    <label
      >{t('E-Mail')}
      <input
        name="email"
        type="email"
        value={person?.email || ''}
        autocomplete="email"
        maxlength="500"
      /></label
    ><label
      >{t('Telefon')}
      <input
        name="phone"
        type="tel"
        value={person?.phone || ''}
        autocomplete="tel"
        maxlength="500"
      /></label
    >
  </div>
  <fieldset class="address-fields">
    <legend>{t('Adresse')} <span class="muted">{t('· optional')}</span></legend>
    <div class="form-grid address-street-fields">
      <label
        >{t('Straße')}
        <input
          name="street"
          value={person?.street || ''}
          maxlength="500"
          autocomplete="address-line1"
        /></label
      >
      <label
        >{t('Hausnummer')}
        <input name="houseNumber" value={person?.houseNumber || ''} maxlength="50" /></label
      >
    </div>
    <div class="form-grid address-city-fields">
      <label
        >{t('PLZ')}
        <input
          name="postalCode"
          value={person?.postalCode || ''}
          maxlength="20"
          autocomplete="postal-code"
        /></label
      >
      <label
        >{t('Ort')}
        <input
          name="location"
          value={person?.location || ''}
          maxlength="500"
          autocomplete="address-level2"
        /></label
      >
    </div>
  </fieldset>
  <TagPicker bind:selected={tags} available={availableTags} />
  <fieldset>
    <legend>{t('Geburtstag')} <span class="muted">{t('· optional')}</span></legend>
    <div class="birthday-fields">
      <label
        >{t('Tag')}
        <input
          name="birthDay"
          type="number"
          min="1"
          max="31"
          value={person?.birthday?.day ?? ''}
        /></label
      >
      <label
        >{t('Monat')}
        <select name="birthMonth" value={person?.birthday?.month || ''}
          ><option value="">{t('Monat')}</option
          >{#each ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'] as month, i}<option
              value={i + 1}>{month}</option
            >{/each}</select
        ></label
      >
      <label
        >{t('Jahr')}
        <input
          name="birthYear"
          type="number"
          min="1900"
          max="9998"
          value={person?.birthday?.year ?? ''}
          placeholder={t('Optional')}
        /></label
      >
    </div>
  </fieldset>
  <label
    >{t('Wissenswertes')}
    <textarea name="notes" rows="4" maxlength="50000" placeholder={t('Was möchtest du dir merken?')}
      >{person?.notes || ''}</textarea
    ></label
  >
  <div class="form-footer">
    <span class="muted small">{t('Nur der Name ist erforderlich.')}</span><button
      class="button primary"
      disabled={busy || photoBusy}
      >{busy ? t('Speichert …') : person ? t('Änderungen speichern') : t('Person anlegen')}</button
    >
  </div>
</form>
