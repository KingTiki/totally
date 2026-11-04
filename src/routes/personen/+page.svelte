<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { APP_NAME } from '#lib/brand';
  import { formatDate } from '#lib/dates';
  import { addressLines } from '#lib/address';
  import Avatar from '#lib/components/Avatar.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import Modal from '#lib/components/Modal.svelte';
  import PersonForm from '#lib/components/PersonForm.svelte';
  import Notice from '#lib/components/Notice.svelte';
  import TrashPeopleButton from '#lib/components/TrashPeopleButton.svelte';
  let { data, form } = $props();
  let creating = $state(false),
    search = $state(''),
    tag = $state('');
  let selecting = $state(false),
    selectedIds = $state<string[]>([]);
  const tags = $derived(
    [...new Set(data.people.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'de'))
  );
  const people = $derived(
    data.people.filter(
      (p) =>
        (!tag || p.tags.includes(tag)) &&
        `${p.name} ${p.context} ${addressLines(p).join(' ')} ${p.tags.join(' ')}`
          .toLocaleLowerCase('de')
          .includes(search.toLocaleLowerCase('de'))
    )
  );
  const selectedPeople = $derived(people.filter((person) => selectedIds.includes(person.id)));
  function finishSelection() {
    selecting = false;
    selectedIds = [];
  }
</script>

<svelte:head><title>{t('Personen ·')} {APP_NAME}</title></svelte:head>
<div class="page-heading">
  <div>
    <p class="eyebrow">{t('DEIN PERSÖNLICHES ADRESSBUCH')}</p>
    <h1>{t('Deine Menschen')}<span class="heading-dot">.</span></h1>
    <p class="page-description">{t('Was sie ausmacht. Was euch verbindet.')}</p>
  </div>
  <button class="button primary" onclick={() => (creating = true)}
    ><Icon name="plus" size={18} />{t('Person hinzufügen')}</button
  >
</div>
<Notice {form} />
<div class="people-tools">
  <div class="search-area">
    <Icon name="search" size={19} /><input
      aria-label={t('Personen durchsuchen')}
      bind:value={search}
      placeholder={t('Name, Adresse oder Kontext suchen …')}
    />
  </div>
  <label class="filter-select"
    ><span class="sr-only">{t('Nach Tag filtern')}</span><select bind:value={tag}
      ><option value="">{t('Alle Tags')}</option>{#each tags as name}<option value={name}
          >{name}</option
        >{/each}</select
    ></label
  >
</div>
<div class="section-heading">
  <p class="muted small">
    {people.length}
    {people.length === 1 ? t('Person') : t('Personen')}{tag ? ` · ${tag}` : ''}
  </p>
  <button
    class="text-button"
    onclick={() => {
      selecting = !selecting;
      selectedIds = [];
    }}
  >
    {selecting ? t('Auswahl beenden') : t('Kontakte auswählen')}
  </button>
</div>
{#if selecting && people.length}
  <div class="selection-tools">
    <label class="check-option"
      ><input
        type="checkbox"
        checked={selectedPeople.length === people.length}
        onchange={(event) =>
          (selectedIds = event.currentTarget.checked ? people.map((person) => person.id) : [])}
      />{t('Alle angezeigten auswählen')}</label
    >
    <span class="muted small">{selectedPeople.length} {t('ausgewählt')}</span>
    <TrashPeopleButton
      people={selectedPeople}
      label="Auswahl in den Papierkorb"
      onsaved={finishSelection}
    />
  </div>
{/if}
{#if people.length}<div class="people-list">
    {#each people as person, i}<div class="selectable-person">
        {#if selecting}<label class="person-selection"
            ><span class="sr-only">{person.name} {t('auswählen')}</span><input
              type="checkbox"
              value={person.id}
              bind:group={selectedIds}
            /></label
          >{/if}
        <a class="person-row" href={`/personen/${person.id}`}
          ><Avatar
            {person}
            class={`large-avatar ${i % 3 === 1 ? 'avatar-warm' : i % 3 === 2 ? 'avatar-lilac' : ''}`}
          />
          <div class="person-identity">
            <h2>{person.name}</h2>
            <p>{person.context || person.location || t('Noch kein Kontext ergänzt')}</p>
            <div class="mobile-tags">
              {#each person.tags.slice(0, 2) as tag}<span class="tag">{tag}</span>{/each}
            </div>
          </div>
          <div class="person-tags">
            {#each person.tags.slice(0, 3) as tag}<span class="tag">{tag}</span>{/each}
          </div>
          <div class="last-contact">
            <span class="small muted">{t('Letzter Kontakt')}</span><span
              >{person.lastContact
                ? formatDate(person.lastContact, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })
                : t('Noch nicht erfasst')}</span
            >
          </div>
          <Icon name="chevron" size={18} /></a
        >
      </div>{/each}
  </div>
{:else}<div class="empty-state panel">
    <span class="empty-icon"><Icon name="people" size={30} /></span>
    <h2>
      {data.people.length ? t('Niemand unter diesem Filter.') : t('Für die wichtigen Menschen.')}
    </h2>
    <p>
      {data.people.length
        ? t('Probiere einen anderen Namen oder Tag.')
        : t('Starte mit einem Namen. Alles andere kannst du nach und nach ergänzen.')}
    </p>
    {#if !data.people.length}<button class="button primary" onclick={() => (creating = true)}
        >{t('Erste Person anlegen')}<Icon name="plus" size={17} /></button
      >{:else}<button
        class="button secondary"
        onclick={() => {
          search = '';
          tag = '';
        }}>{t('Filter zurücksetzen')}</button
      >{/if}
  </div>{/if}
{#if creating}<Modal title={t('Person hinzufügen')} onclose={() => (creating = false)}
    ><PersonForm
      action="?/create"
      availableTags={data.people.flatMap((person) => person.tags)}
      onsaved={() => (creating = false)}
    /></Modal
  >{/if}

<style>
  .selection-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    margin-bottom: 1rem;
  }
  .selectable-person {
    display: flex;
    align-items: stretch;
  }
  .selectable-person + .selectable-person {
    border-top: 1px solid var(--line);
  }
  .selectable-person .person-row {
    flex: 1;
    min-width: 0;
  }
  .person-selection {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: row;
    padding: 0 0.75rem;
    cursor: pointer;
  }
</style>
