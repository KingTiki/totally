<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { APP_NAME } from '#lib/brand';
  import { formatDate } from '#lib/dates';
  import { addressLines, googleMapsUrl } from '#lib/address';
  import Avatar from '#lib/components/Avatar.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import Modal from '#lib/components/Modal.svelte';
  import PersonForm from '#lib/components/PersonForm.svelte';
  import EntryForm from '#lib/components/EntryForm.svelte';
  import ReminderForm from '#lib/components/ReminderForm.svelte';
  import AgendaList from '#lib/components/AgendaList.svelte';
  import Notice from '#lib/components/Notice.svelte';
  import ContactRhythmCard from '#lib/components/ContactRhythmCard.svelte';
  import ContactRhythmForm from '#lib/components/ContactRhythmForm.svelte';
  import type { Entry, Topic } from '#lib/model';
  import TopicsPanel from '#lib/components/TopicsPanel.svelte';
  import TopicForm from '#lib/components/TopicForm.svelte';
  import HistoryEntry from '#lib/components/HistoryEntry.svelte';
  import TrashPeopleButton from '#lib/components/TrashPeopleButton.svelte';
  import { enhanceForm } from '#lib/client';
  let { data, form } = $props();
  let modal = $state<
      | 'edit'
      | 'note'
      | 'contact'
      | 'reminder'
      | 'relationship'
      | 'rhythm'
      | 'topic'
      | 'entryEdit'
      | null
    >(null),
    selected = $state<string[]>([]),
    relationError = $state('');
  let editedEntry = $state<Entry | undefined>(),
    editedTopic = $state<Topic | undefined>(),
    entryTopicId = $state('');
  function openEntry(kind: 'note' | 'contact', ids = [data.person.id], topicId = '') {
    selected = ids;
    entryTopicId = topicId;
    modal = kind;
  }
  function editEntry(entry: Entry) {
    editedEntry = entry;
    modal = 'entryEdit';
  }
  const birthdayText = $derived(
    data.person.birthday
      ? `${data.person.birthday.day}. ${['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][data.person.birthday.month - 1]}${data.person.birthday.year ? ` ${data.person.birthday.year}` : ''}`
      : ''
  );
  const address = $derived(addressLines(data.person));
  const mapsUrl = $derived(googleMapsUrl(data.person));
</script>

<svelte:head><title>{data.person.name} · {APP_NAME}</title></svelte:head>
<a class="back-link" href="/personen"><Icon name="back" size={16} />{t('Alle Personen')}</a>
<div class="profile-heading">
  <div class="profile-identity">
    <Avatar person={data.person} class="profile-avatar" />
    <div>
      <p class="eyebrow">{data.person.context || t('EIN MENSCH IN DEINEM LEBEN')}</p>
      <h1>{data.person.name}</h1>
      {#if mapsUrl}<address class="profile-address">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('Adresse in Google Maps öffnen: {p0}', { p0: address.join(', ') })}
            title={t('In Google Maps öffnen')}
          >
            <Icon name="pin" size={17} />
            <span class="address-lines"
              >{#each address as line}<span>{line}</span>{/each}</span
            >
            <span class="address-external" aria-hidden="true">↗</span>
          </a>
        </address>{/if}
      <div class="tag-line">
        {#each data.person.tags as tag}<span class="tag">{tag}</span>{/each}
      </div>
    </div>
  </div>
  <div class="profile-management">
    <button class="button secondary" onclick={() => (modal = 'edit')}
      ><Icon name="edit" size={16} />{t('Profil bearbeiten')}</button
    >
    <TrashPeopleButton people={[data.person]} />
  </div>
</div>
<div class="profile-actions">
  <button class="button primary" onclick={() => openEntry('note')}
    ><Icon name="plus" size={17} />{t('Notiz erfassen')}</button
  ><button class="button secondary" onclick={() => openEntry('contact')}
    ><Icon name="contact" size={17} />{t('Kontakt festhalten')}</button
  ><button class="button secondary" onclick={() => (modal = 'reminder')}
    ><Icon name="bell" size={17} />{t('Erinnerung')}</button
  >
</div>
<Notice {form} />
<div class="profile-grid">
  <div class="profile-main">
    <section class="profile-section">
      <div class="section-heading">
        <h2>{t('Wissenswertes')}</h2>
        <button class="text-button" onclick={() => (modal = 'edit')}>{t('Bearbeiten')}</button>
      </div>
      {#if data.person.notes}<p class="prose-text">{data.person.notes}</p>{:else}<p class="muted">
          {t(
            'Lieblingsessen, Geschenkideen oder die Geschichte hinter eurem Kennenlernen. Hier ist Platz dafür.'
          )}
        </p>{/if}
    </section>
    <TopicsPanel
      topics={data.topics}
      entries={data.entries}
      people={data.people}
      profileId={data.person.id}
      oncreate={() => {
        editedTopic = undefined;
        modal = 'topic';
      }}
      onedit={(topic) => {
        editedTopic = topic;
        modal = 'topic';
      }}
      onentry={(topic) => openEntry('note', [data.person.id], topic.id)}
      oneditentry={editEntry}
    />
    <section class="profile-section">
      <div class="section-heading">
        <h2>{t('Anstehend')}</h2>
        <button class="text-button" onclick={() => (modal = 'reminder')}
          ><Icon name="plus" size={16} />{t('Hinzufügen')}</button
        >
      </div>
      {#if data.items.length}<AgendaList
          items={data.items}
          people={data.people}
          today={data.today}
          compact
          oncontact={(ids) => openEntry('contact', ids)}
        />{:else}<p class="muted">{t('Gerade keine anstehenden Termine.')}</p>{/if}
      {#each data.paused as reminder}<div class="paused-row">
          <span><Icon name="pause" size={15} />{reminder.title}<small>{t('Pausiert')}</small></span>
          <form method="POST" action="?/reminder" use:enhanceForm>
            <input type="hidden" name="id" value={reminder.id} /><input
              type="hidden"
              name="operation"
              value="resume"
            /><button class="text-button">{t('Fortsetzen')}</button>
          </form>
        </div>{/each}
    </section>
    <section class="profile-section" aria-label={t('Eure Geschichte')}>
      <div class="section-heading">
        <h2>{t('Eure Geschichte')} <span class="count-label">{data.entries.length}</span></h2>
        <button class="text-button" onclick={() => openEntry('note')}
          >{t('Eintrag hinzufügen')}</button
        >
      </div>
      {#if data.entries.length}<div class="timeline">
          {#each data.entries as entry}<HistoryEntry
              {entry}
              people={data.people}
              topics={data.topics}
              profileId={data.person.id}
              onedit={editEntry}
            />{/each}
        </div>{:else}<div class="empty-inline">
          <Icon name="note" size={24} />
          <p>{t('Das nächste Gespräch ist ein guter Anfang.')}</p>
        </div>{/if}
    </section>
  </div>
  <aside class="profile-aside">
    <ContactRhythmCard
      rhythm={data.rhythms[0]}
      count={data.rhythms.length}
      today={data.today}
      onedit={() => (modal = 'rhythm')}
    />
    <section class="panel detail-card">
      <h3>{t('Auf einen Blick')}</h3>
      <dl>
        {#if birthdayText}<div>
            <dt><Icon name="cake" size={17} />{t('Geburtstag')}</dt>
            <dd>{birthdayText}</dd>
          </div>{/if}{#if data.person.email}<div>
            <dt><Icon name="mail" size={17} />{t('E-Mail')}</dt>
            <dd><a href={`mailto:${data.person.email}`}>{data.person.email}</a></dd>
          </div>{/if}{#if data.person.phone}<div>
            <dt><Icon name="contact" size={17} />{t('Telefon')}</dt>
            <dd><a href={`tel:${data.person.phone}`}>{data.person.phone}</a></dd>
          </div>{/if}
        <div>
          <dt><Icon name="clock" size={17} />{t('Letzter Kontakt')}</dt>
          <dd>
            {data.lastContact
              ? formatDate(data.lastContact, { day: 'numeric', month: 'long', year: 'numeric' })
              : t('Noch nicht erfasst')}
          </dd>
        </div>
      </dl>
    </section>
    <section class="panel detail-card">
      <div class="section-heading">
        <h3>{t('Verbindungen')}</h3>
        <button
          class="icon-button"
          aria-label={t('Verbindung hinzufügen')}
          onclick={() => (modal = 'relationship')}><Icon name="plus" size={18} /></button
        >
      </div>
      {#if relationError}<p class="notice error" role="alert">
          {relationError}
        </p>{/if}{#each data.relationships as relation}{@const from = data.people.find(
          (p) => p.id === relation.fromId
        )!}{@const to = data.people.find((p) => p.id === relation.toId)!}{@const other =
          relation.fromId === data.person.id ? to : from}
        <div class="relationship">
          <a href={`/personen/${other.id}`}
            ><Avatar person={other} class="small-avatar" /><span
              ><strong>{other.name}</strong><small>{from.name} {relation.label} {to.name}</small
              ></span
            ></a
          >
          <form
            method="POST"
            action="?/removeRelationship"
            use:enhanceForm={{ onerror: (m) => (relationError = m) }}
          >
            <input type="hidden" name="id" value={relation.id} /><button
              class="icon-button"
              title={t('Verbindung entfernen')}
              aria-label={t('Verbindung zu {p0} entfernen', { p0: other.name })}
              ><Icon name="close" size={14} /></button
            >
          </form>
        </div>{:else}<p class="muted small">
          {t('Wer gehört dazu? Verbinde Menschen aus deinem Adressbuch.')}
        </p>
        <button class="inline-link" onclick={() => (modal = 'relationship')}
          >{t('Verbindung hinzufügen')}<Icon name="plus" size={15} /></button
        >{/each}
    </section>
  </aside>
</div>
{#if modal === 'topic'}<Modal
    title={editedTopic ? t('Thema bearbeiten') : t('Thema anlegen')}
    onclose={() => (modal = null)}
  >
    <TopicForm topic={editedTopic} onsaved={() => (modal = null)} />
  </Modal>
{:else if modal === 'entryEdit' && editedEntry}<Modal
    title={t('Eintrag bearbeiten')}
    onclose={() => (modal = null)}
  >
    <EntryForm
      entry={editedEntry}
      people={data.people}
      topics={data.topics}
      today={data.today}
      onsaved={() => (modal = null)}
    />
  </Modal>
{:else if modal === 'rhythm'}<Modal
    title={t('Kontaktrhythmus einstellen')}
    onclose={() => (modal = null)}
  >
    <ContactRhythmForm
      rhythm={data.rhythms[0]}
      count={data.rhythms.length}
      onsaved={() => (modal = null)}
    />
  </Modal>
{:else if modal === 'edit'}<Modal title={t('Profil bearbeiten')} onclose={() => (modal = null)}
    ><PersonForm
      person={data.person}
      availableTags={data.people.flatMap((person) => person.tags)}
      action="?/save"
      onsaved={() => (modal = null)}
    /></Modal
  >
{:else if modal === 'note' || modal === 'contact'}<Modal
    title={modal === 'contact' ? t('Kontakt festhalten') : t('Notiz erfassen')}
    onclose={() => (modal = null)}
    ><EntryForm
      people={data.people}
      today={data.today}
      {selected}
      kind={modal}
      topics={data.topics}
      topicId={entryTopicId}
      onsaved={() => (modal = null)}
    /></Modal
  >
{:else if modal === 'reminder'}<Modal title={t('Erinnerung anlegen')} onclose={() => (modal = null)}
    ><ReminderForm
      people={data.people}
      today={data.today}
      selected={[data.person.id]}
      onsaved={() => (modal = null)}
    /></Modal
  >
{:else if modal === 'relationship'}<Modal
    title={t('Verbindung hinzufügen')}
    onclose={() => (modal = null)}
    >{#if data.people.length < 2}<p class="muted">{t('Lege zuerst eine weitere Person an.')}</p>
      <a class="button primary" href="/personen">{t('Zu den Personen')}</a>{:else}<form
        class="form-stack"
        method="POST"
        action="?/relationship"
        use:enhanceForm={{ onsaved: () => (modal = null), onerror: (m) => (relationError = m) }}
      >
        {#if relationError}<p class="notice error" role="alert">{relationError}</p>{/if}
        <p class="muted">{data.person.name} …</p>
        <label
          >{t('Verbindung')}
          <input
            name="label"
            placeholder={t('Zum Beispiel: ist Partnerin von')}
            required
            maxlength="100"
          /></label
        ><label
          >{t('Zu welcher Person?')}
          <select name="toId" required
            ><option value="">{t('Person auswählen')}</option
            >{#each data.people.filter((p) => p.id !== data.person.id) as person}<option
                value={person.id}>{person.name}</option
              >{/each}</select
          ></label
        ><button class="button primary">{t('Verbindung speichern')}</button>
      </form>{/if}</Modal
  >{/if}
