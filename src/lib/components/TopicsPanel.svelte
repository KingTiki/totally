<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import type { Entry, Person, Topic } from '#lib/model';
  import { enhanceForm } from '#lib/client';
  import Icon from './Icon.svelte';
  import HistoryEntry from './HistoryEntry.svelte';
  let {
    topics,
    entries,
    people,
    profileId,
    oncreate,
    onedit,
    onentry,
    oneditentry
  }: {
    topics: Topic[];
    entries: Entry[];
    people: Person[];
    profileId: string;
    oncreate: () => void;
    onedit: (topic: Topic) => void;
    onentry: (topic: Topic) => void;
    oneditentry: (entry: Entry) => void;
  } = $props();
  let error = $state('');
  const owned = $derived(
    topics
      .filter((topic) => topic.personId === profileId)
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  );
  const active = $derived(owned.filter((topic) => topic.state === 'active'));
  const done = $derived(owned.filter((topic) => topic.state === 'done'));
</script>

{#snippet topicCard(topic: Topic)}
  {@const related = entries.filter((entry) => entry.topicId === topic.id)}
  <article class="topic-card" id={`thema-${topic.id}`} aria-label={topic.title}>
    <div class="topic-heading">
      <h3>{topic.title}</h3>
      <button
        class="icon-button"
        aria-label={t('Thema {p0} bearbeiten', { p0: topic.title })}
        onclick={() => onedit(topic)}><Icon name="edit" size={16} /></button
      >
    </div>
    {#if topic.description}<p class="prose-text topic-description">{topic.description}</p>{/if}
    <div class="topic-actions">
      {#if topic.state === 'active'}<button
          class="text-button"
          aria-label={t('Eintrag zu {p0} hinzufügen', { p0: topic.title })}
          onclick={() => onentry(topic)}
          ><Icon name="plus" size={14} />{t('Eintrag ergänzen')}</button
        >{/if}
      <form
        method="POST"
        action="?/topic"
        use:enhanceForm={{ onerror: (message) => (error = message) }}
      >
        <input type="hidden" name="id" value={topic.id} /><input
          type="hidden"
          name="operation"
          value={topic.state === 'active' ? 'complete' : 'reopen'}
        />
        <button
          class="text-button"
          aria-label={t('Thema {p0} {p1}', {
            p0: topic.title,
            p1: topic.state === 'active' ? t('abschließen') : t('wieder öffnen')
          })}
          ><Icon name={topic.state === 'active' ? 'check' : 'arrow'} size={14} />{topic.state ===
          'active'
            ? t('Abschließen')
            : t('Wieder öffnen')}</button
        >
      </form>
    </div>
    {#if related.length}<details class="topic-history">
        <summary
          >{related.length}
          {related.length === 1 ? t('Eintrag') : t('Einträge')}
          {t('zum Thema')}</summary
        >
        <div class="timeline">
          {#each related as entry}<HistoryEntry
              {entry}
              {people}
              {profileId}
              onedit={oneditentry}
            />{/each}
        </div>
      </details>{/if}
  </article>
{/snippet}

<section class="profile-section topics-section" aria-label={t('Laufende Themen')}>
  <div class="section-heading">
    <h2>{t('Laufende Themen')} <span class="count-label">{active.length}</span></h2>
    <button class="text-button" onclick={oncreate}
      ><Icon name="plus" size={16} />{t('Thema hinzufügen')}</button
    >
  </div>
  {#if error}<p class="notice error" role="alert">{error}</p>{/if}
  {#each active as topic (topic.id)}{@render topicCard(topic)}{:else}<p class="muted">
      {t(
        'Was beschäftigt diese Person gerade? Halte ein Thema fest und ergänze nach und nach neue Entwicklungen.'
      )}
    </p>{/each}
  {#if done.length}<details class="closed-topics">
      <summary>{t('Abgeschlossene Themen (')}{done.length})</summary
      >{#each done as topic (topic.id)}{@render topicCard(topic)}{/each}
    </details>{/if}
</section>
