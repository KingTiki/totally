<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { APP_NAME } from '#lib/brand';
  import { formatDate, localClock } from '#lib/dates';
  import { enhanceForm } from '#lib/client';
  import Avatar from '#lib/components/Avatar.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import Notice from '#lib/components/Notice.svelte';
  let { data, form } = $props();
</script>

<svelte:head><title>{t('Papierkorb ·')} {APP_NAME}</title></svelte:head>
<a class="back-link" href="/einstellungen"><Icon name="back" size={16} />{t('Einstellungen')}</a>
<div class="page-heading">
  <div>
    <p class="eyebrow">{t('KONTAKTE WIEDERFINDEN')}</p>
    <h1>{t('Papierkorb')}<span class="heading-dot">.</span></h1>
    <p class="page-description">
      {data.people.length}
      {data.people.length === 1 ? t('Kontakt') : t('Kontakte')}
      {t('im Papierkorb.')}
    </p>
  </div>
</div>
<Notice {form} />
<p class="muted">
  {t(
    'Fotos, Notizen und Verbindungen bleiben erhalten. Zugehörige Erinnerungen ruhen, bis alle beteiligten Kontakte wiederhergestellt sind.'
  )}
</p>
{#if data.people.length}
  <ul class="trash-list" aria-label={t('Kontakte im Papierkorb')}>
    {#each data.people as person (person.id)}
      <li class="panel trash-row">
        <Avatar {person} class="small-avatar" />
        <div class="trash-identity">
          <strong>{person.name}</strong>
          <span class="muted small"
            >{t('Gelöscht am')}
            {formatDate(localClock(new Date(person.deletedAt!), data.timezone).date, {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}</span
          >
        </div>
        <form method="POST" action="?/restore" use:enhanceForm>
          <input type="hidden" name="id" value={person.id} />
          <input type="hidden" name="version" value={person.deletedAt} />
          <button
            class="button secondary small-button"
            aria-label={t('{p0} wiederherstellen', { p0: person.name })}
            ><Icon name="back" size={16} />{t('Wiederherstellen')}</button
          >
        </form>
      </li>
    {/each}
  </ul>
{:else}
  <div class="empty-state">
    <Icon name="trash" size={32} />
    <h2>{t('Der Papierkorb ist leer.')}</h2>
    <p>{t('Hier findest du Kontakte, die du aus deiner Liste gelöscht hast.')}</p>
  </div>
{/if}

<style>
  .trash-list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }
  .trash-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    flex-wrap: wrap;
  }
  .trash-identity {
    display: grid;
    gap: 0.25rem;
    flex: 1;
    min-width: 9rem;
    overflow-wrap: anywhere;
  }
</style>
