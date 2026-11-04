<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import type { Person, Entry, Topic } from '#lib/model';
  import { untrack } from 'svelte';
  import { enhanceForm } from '#lib/client';
  let {
    people,
    today,
    selected = [],
    kind = 'note',
    entry,
    topics = [],
    topicId = '',
    onsaved
  }: {
    people: Person[];
    today: string;
    selected?: string[];
    kind?: 'note' | 'contact';
    entry?: Entry;
    topics?: Topic[];
    topicId?: string;
    onsaved?: () => void;
  } = $props();
  let entryKind = $state<'note' | 'contact'>(untrack(() => entry?.kind || kind)),
    followUp = $state(''),
    error = $state(''),
    busy = $state(false);
  let selectedPeople = $state(untrack(() => [...(entry?.personIds || selected)]));
  let selectedTopic = $state(untrack(() => entry?.topicId || topicId));
  const topicOptions = $derived(
    topics.filter(
      (topic) =>
        (topic.state === 'active' || topic.id === selectedTopic) &&
        (selectedPeople.includes(topic.personId) || topic.id === selectedTopic)
    )
  );
  const contactTypes = ['Gesprochen', 'Telefoniert', 'Getroffen', 'Geschrieben', 'Videoanruf'];
</script>

<form
  method="POST"
  action={entry ? '?/updateEntry' : '?/entry'}
  use:enhanceForm={{ onsaved, onerror: (m) => (error = m), onbusy: (b) => (busy = b) }}
  class="form-stack"
>
  {#if error}<p class="notice error" role="alert">{error}</p>{/if}
  {#if entry}<input type="hidden" name="id" value={entry.id} /><input
      type="hidden"
      name="version"
      value={entry.updatedAt || entry.createdAt}
    />
    <p class="field-help">
      {t(
        'Änderungen gelten für alle zugeordneten Personen. Bestehende Wiedervorlagen bleiben unverändert.'
      )}
    </p>{/if}
  <div class="segmented" aria-label={t('Eintragstyp')}>
    <label
      ><input type="radio" name="kind" value="note" bind:group={entryKind} /> {t('Notiz')}</label
    ><label
      ><input type="radio" name="kind" value="contact" bind:group={entryKind} />
      {t('Kontakt festhalten')}</label
    >
  </div>
  <fieldset>
    <legend>{t('Personen')}</legend>
    <div class="person-picker">
      {#each people.toSorted((a, b) => a.name.localeCompare(b.name, 'de')) as person}<label
          class="check-option"
          ><input
            type="checkbox"
            name="personIds"
            value={person.id}
            bind:group={selectedPeople}
          />{person.name}</label
        >{/each}
    </div>
  </fieldset>
  <div class="form-grid">
    <label
      >{t('Datum')}
      <input
        lang="de"
        type="date"
        name="date"
        value={entry?.date || today}
        max={today}
        required
      /></label
    >{#if entryKind === 'contact'}<label
        >{t('Kontaktart')}
        <select name="contactType" value={entry?.contactType || 'Gesprochen'}
          >{#if entry?.contactType && !contactTypes.includes(entry.contactType)}<option
              >{entry.contactType}</option
            >{/if}
          {#each contactTypes as contactType}<option value={contactType}
              >{t.contactType(contactType)}</option
            >{/each}</select
        ></label
      >{/if}
  </div>
  <label
    >{entryKind === 'note' ? t('Notiz') : t('Was gibt es Neues?')}
    <textarea
      name="text"
      rows="5"
      required={entryKind === 'note'}
      maxlength="50000"
      placeholder={t('Was möchtest du festhalten?')}>{entry?.text || ''}</textarea
    ></label
  >
  {#if topicOptions.length}<label
      >{t('Thema')}
      <select name="topicId" bind:value={selectedTopic}>
        <option value="">{t('Ohne Thema')}</option>{#each topicOptions as topic}<option
            value={topic.id}
            >{topic.title}{topic.state === 'done' ? t(' · abgeschlossen') : ''} · {people.find(
              (person) => person.id === topic.personId
            )?.name}</option
          >{/each}
      </select></label
    >{:else}<input type="hidden" name="topicId" value="" />{/if}
  {#if !entry}<div class="inset">
      <label
        >{t('Später aufgreifen')}
        <input lang="de" name="followUp" type="date" bind:value={followUp} min={today} /></label
      >{#if followUp}<label
          >{t('Woran erinnern?')}
          <input
            name="followUpTitle"
            placeholder={t('Zum Beispiel: Nach dem Gespräch fragen')}
            maxlength="500"
          /></label
        >{/if}
      <p class="field-help">
        {t('Optional. Die Wiedervorlage wird mit diesem Eintrag gespeichert.')}
      </p>
    </div>{/if}
  <div class="form-footer">
    <span class="muted small"
      >{entryKind === 'note'
        ? t('Eine Notiz zählt nicht als Kontakt.')
        : t('Aktualisiert den letzten Kontakt.')}</span
    ><button class="button primary" disabled={busy}
      >{busy
        ? t('Speichert …')
        : entry
          ? t('Änderungen speichern')
          : t('Eintrag speichern')}</button
    >
  </div>
</form>
