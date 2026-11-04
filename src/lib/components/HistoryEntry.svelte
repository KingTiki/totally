<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import type { Entry, Person, Topic } from '#lib/model';
  import { formatDate } from '#lib/dates';
  import { enhanceForm } from '#lib/client';
  import Icon from './Icon.svelte';
  let {
    entry,
    people,
    profileId,
    topics = [],
    onedit
  }: {
    entry: Entry;
    people: Person[];
    profileId: string;
    topics?: Topic[];
    onedit: (entry: Entry) => void;
  } = $props();
  const topic = $derived(topics.find((topic) => topic.id === entry.topicId));
  const otherPeople = $derived(
    people.filter((person) => entry.personIds.includes(person.id) && person.id !== profileId)
  );
  let busy = $state(false),
    error = $state('');
  function confirmDelete(data: FormData) {
    const kind = entry.kind === 'contact' ? t.contactType(entry.contactType) : t('Notiz');
    const preview = entry.text.length > 160 ? `${entry.text.slice(0, 160)}…` : entry.text;
    const shared =
      entry.personIds.length > 1
        ? t('\n\nDer gemeinsame Eintrag wird bei allen {p0} verknüpften Personen gelöscht.', {
            p0: entry.personIds.length
          })
        : '';
    if (
      !window.confirm(
        t('Diesen Eintrag wirklich löschen?\n\n{p0} vom {p1}{p2}{p3}', {
          p0: kind,
          p1: formatDate(entry.date, { day: 'numeric', month: 'long', year: 'numeric' }),
          p2: preview ? `\n${preview}` : '',
          p3: shared
        })
      )
    )
      return false;
    data.set('confirm', 'on');
    return true;
  }
</script>

<article class="timeline-entry" data-entry-id={entry.id}>
  <div class="timeline-marker">
    <Icon name={entry.kind === 'contact' ? 'contact' : 'note'} size={16} />
  </div>
  <div>
    <div class="timeline-meta">
      <strong>{entry.kind === 'contact' ? t.contactType(entry.contactType) : t('Notiz')}</strong>
      <time datetime={entry.date}
        >{formatDate(entry.date, { day: 'numeric', month: 'long', year: 'numeric' })}</time
      >
      {#if entry.updatedAt}<span
          class="entry-edited"
          title={t('Dieser Eintrag wurde nachträglich bearbeitet.')}>{t('Bearbeitet')}</span
        >{/if}
      <div class="entry-actions">
        <button
          class="text-button entry-edit"
          aria-label={t('Eintrag bearbeiten')}
          disabled={busy}
          onclick={() => onedit(entry)}><Icon name="edit" size={13} />{t('Bearbeiten')}</button
        >
        <form
          method="POST"
          action="?/deleteEntry"
          use:enhanceForm={{
            onconfirm: confirmDelete,
            onbusy: (value) => (busy = value),
            onerror: (message) => (error = message)
          }}
        >
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="version" value={entry.updatedAt || entry.createdAt} />
          <button
            class="text-button entry-delete"
            aria-label={t('Eintrag löschen')}
            disabled={busy}
          >
            <Icon name="trash" size={13} />{busy ? t('Löscht …') : t('Löschen')}
          </button>
        </form>
      </div>
    </div>
    {#if error}<p class="notice error" role="alert">{error}</p>{/if}
    {#if entry.text}<p class="prose-text">{entry.text}</p>{/if}
    {#if topic}<a class="entry-topic" href={`/personen/${topic.personId}#thema-${topic.id}`}
        ><Icon name="note" size={12} />{topic.title}</a
      >{/if}
    {#if otherPeople.length}<div class="entry-people">
        {t('Mit')}
        {#each otherPeople as person, i}{#if i > 0},
          {/if}<a href={`/personen/${person.id}`}>{person.name}</a>{/each}
      </div>{/if}
  </div>
</article>
