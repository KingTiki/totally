<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { APP_NAME } from '#lib/brand';
  import Icon from '#lib/components/Icon.svelte';
  import Modal from '#lib/components/Modal.svelte';
  import EntryForm from '#lib/components/EntryForm.svelte';
  import ReminderForm from '#lib/components/ReminderForm.svelte';
  import AgendaList from '#lib/components/AgendaList.svelte';
  import Notice from '#lib/components/Notice.svelte';
  import { enhanceForm } from '#lib/client';
  import { daysBetween } from '#lib/dates';
  import { addressLines } from '#lib/address';
  import Avatar from '#lib/components/Avatar.svelte';
  let { data, form } = $props();
  let modal = $state<'note' | 'contact' | 'reminder' | null>(null),
    selected = $state<string[]>([]),
    filter = $state('all'),
    search = $state('');
  const items = $derived(data.items.filter((i) => filter === 'all' || i.kind === filter));
  const dueCount = $derived(data.items.filter((item) => item.date <= data.today).length);
  const nextItem = $derived(data.items.find((item) => item.date > data.today));
  const overview = $derived(
    dueCount
      ? t('Heute {p0} auf dich.', {
          p0:
            dueCount === 1
              ? t('wartet ein Anlass oder offener Faden')
              : t('warten {p0} Anlässe und offene Fäden', { p0: dueCount })
        })
      : nextItem
        ? t('Heute ist nichts fällig. Als Nächstes {p0}: {p1}.', {
            p0:
              daysBetween(data.today, nextItem.date) === 1
                ? t('morgen')
                : t('in {p0} Tagen', { p0: daysBetween(data.today, nextItem.date) }),
            p1: nextItem.title
          })
        : t('Kleine Anlässe, offene Fäden und Menschen, an die du denkst.')
  );
  const searchResults = $derived(
    search.trim()
      ? data.people
          .filter((p) =>
            `${p.name} ${p.context} ${addressLines(p).join(' ')} ${p.tags.join(' ')}`
              .toLocaleLowerCase('de')
              .includes(search.toLocaleLowerCase('de'))
          )
          .slice(0, 8)
      : []
  );
  function contact(ids: string[]) {
    selected = ids;
    modal = 'contact';
  }
</script>

<svelte:head><title>{t('Demnächst ·')} {APP_NAME}</title></svelte:head>
<div class="page-heading overview-heading">
  <div>
    <p class="eyebrow">{t('DEIN PERSÖNLICHER ÜBERBLICK')}</p>
    <h1>{t('Demnächst')}<span class="heading-dot">.</span></h1>
    <p class="page-description">{overview}</p>
  </div>
  <button
    class="button primary capture-button"
    aria-label={t('Notiz erfassen')}
    onclick={() => {
      selected = [];
      modal = 'note';
    }}
    disabled={!data.people.length}
    ><Icon name="plus" size={18} /><span>{t('Notiz erfassen')}</span></button
  >
</div>
<Notice {form} />
<div class="search-area overview-search">
  <Icon name="search" size={19} /><input
    aria-label={t('Person suchen')}
    placeholder={t('An wen denkst du?')}
    bind:value={search}
  />{#if search}<button
      class="icon-button"
      aria-label={t('Suche leeren')}
      onclick={() => (search = '')}><Icon name="close" size={16} /></button
    >
    <div class="search-results">
      {#each searchResults as person}<a href={`/personen/${person.id}`}
          ><Avatar {person} class="small-avatar" /><span
            ><strong>{person.name}</strong><small>{person.context || person.location}</small></span
          ><Icon name="arrow" size={16} /></a
        >{:else}<p class="muted">
          {t('Keine Person gefunden.')} <a href="/personen">{t('Personen öffnen')}</a>
        </p>{/each}
    </div>{/if}
</div>
<div class="dashboard-grid">
  <div>
    <div class="section-heading agenda-heading">
      <h2>{t('Was ansteht')}</h2>
      <div class="filter-tabs" aria-label={t('Ereignisse filtern')}>
        <button
          aria-pressed={filter === 'all'}
          class:chosen={filter === 'all'}
          onclick={() => (filter = 'all')}
          >{t('Alles')}<span class="filter-count"> · {data.items.length}</span></button
        ><button
          aria-pressed={filter === 'birthday'}
          class:chosen={filter === 'birthday'}
          onclick={() => (filter = 'birthday')}
          >{t('Geburtstage')}<span class="filter-count">
            · {data.items.filter((item) => item.kind === 'birthday').length}</span
          ></button
        ><button
          aria-pressed={filter === 'reminder'}
          class:chosen={filter === 'reminder'}
          onclick={() => (filter = 'reminder')}
          >{t('Erinnerungen')}<span class="filter-count">
            · {data.items.filter((item) => item.kind === 'reminder').length}</span
          ></button
        >
      </div>
    </div>
    {#if items.length}<AgendaList
        {items}
        weekly
        people={data.people}
        today={data.today}
        oncontact={contact}
      />{:else}<div class="empty-state panel">
        <span class="empty-icon"><Icon name="leaf" size={30} /></span>
        <h2>
          {data.people.length
            ? t('Ein bisschen Platz im Kopf.')
            : t('Hier beginnt dein Adressbuch.')}
        </h2>
        <p>
          {data.people.length
            ? t(
                'In den nächsten 60 Tagen steht hier nichts an. Ein guter Moment, einen offenen Faden festzuhalten.'
              )
            : t(
                'Lege deine erste Person an. Geburtstage und Wiedervorlagen finden dann hier ihren Platz.'
              )}
        </p>
        {#if data.people.length}<button
            class="button secondary"
            onclick={() => (modal = 'reminder')}
            ><Icon name="plus" size={17} />{t('Erinnerung anlegen')}</button
          >{:else}<a class="button primary" href="/personen"
            >{t('Erste Person anlegen')}<Icon name="arrow" size={17} /></a
          >{/if}
      </div>{/if}
    {#if items.length}<p class="list-footnote">
        {t('Dein Ausblick für die nächsten 60 Tage · Überfällige Wiedervorlagen bleiben sichtbar.')}
      </p>{/if}
    {#if data.paused.length}<details class="paused-section">
        <summary>{t('Pausierte Erinnerungen (')}{data.paused.length})</summary
        >{#each data.paused as reminder}<div class="paused-row">
            <span><Icon name="pause" size={15} />{reminder.title}</span>
            <form method="POST" action="?/reminder" use:enhanceForm>
              <input type="hidden" name="id" value={reminder.id} /><input
                type="hidden"
                name="operation"
                value="resume"
              /><button class="text-button">{t('Fortsetzen')}</button>
            </form>
          </div>{/each}
      </details>{/if}
  </div>
  <aside class="context-column">
    <section class="quick-card">
      <span class="eyebrow">{t('WIR SOLLTEN MAL')}</span>
      <h2>{t('Kopf voll?')}</h2>
      <p>{t('Kurz aufschreiben, dann darfst du es wieder vergessen.')}</p>
      <button
        class="button secondary"
        onclick={() => {
          selected = [];
          modal = 'note';
        }}
        disabled={!data.people.length}><Icon name="plus" size={17} />{t('Mach ich.')}</button
      >
      <div class="card-doodle" aria-hidden="true"><Icon name="note" size={54} /><span>↗</span></div>
    </section>
    <section class="quiet-section">
      <div class="section-heading">
        <h3>{t('Deine Menschen')}</h3>
        <a href="/personen" aria-label={t('Alle Personen')}><Icon name="arrow" size={17} /></a>
      </div>
      {#if data.people.length}<div class="avatar-stack">
          {#each data.people.slice(0, 5) as person}<a
              class="avatar-link"
              href={`/personen/${person.id}`}
              title={person.name}
              aria-label={person.name}><Avatar {person} /></a
            >{/each}
        </div>
        <p class="muted small">
          {data.people.length}
          {data.people.length === 1
            ? t('Person in deinem Adressbuch')
            : t('Menschen in deinem Adressbuch')}
        </p>{:else}<p class="muted small">{t('Ein Name genügt für den Anfang.')}</p>{/if}<a
        class="inline-link"
        href="/personen">{t('Person hinzufügen')} <Icon name="plus" size={15} /></a
      >
    </section>
    <section class="mail-card">
      <Icon name="mail" size={21} />
      <div>
        <h3>
          {data.settings.emailEnabled || data.pushDeviceCount
            ? t('Du wirst erinnert.')
            : t('Erinnerungen, die ankommen.')}
        </h3>
        <p>
          {data.pushDeviceCount
            ? t('Push ist auf {p0} {p1} aktiv. Deine Übersicht kommt täglich um {p2} Uhr.', {
                p0: data.pushDeviceCount,
                p1: data.pushDeviceCount === 1 ? t('Gerät') : t('Geräten'),
                p2: data.settings.digestTime
              })
            : data.settings.emailEnabled
              ? t('Deine Übersicht kommt täglich um {p0} Uhr per E-Mail.', {
                  p0: data.settings.digestTime
                })
              : t('Aktiviere deine E-Mail-Übersicht, damit du nicht extra nachsehen musst.')}
        </p>
        <a href="/einstellungen"
          >{data.settings.emailEnabled || data.pushDeviceCount
            ? t('Einstellungen')
            : t('Benachrichtigungen einrichten')}
          <span aria-hidden="true">↗</span></a
        >
      </div>
    </section>
  </aside>
</div>
{#if modal === 'note' || modal === 'contact'}<Modal
    title={modal === 'contact' ? t('Kontakt festhalten') : t('Notiz erfassen')}
    onclose={() => (modal = null)}
    ><EntryForm
      people={data.people}
      today={data.today}
      {selected}
      kind={modal === 'contact' ? 'contact' : 'note'}
      topics={data.topics}
      onsaved={() => (modal = null)}
    /></Modal
  >
{:else if modal === 'reminder'}<Modal title={t('Erinnerung anlegen')} onclose={() => (modal = null)}
    ><ReminderForm people={data.people} today={data.today} onsaved={() => (modal = null)} /></Modal
  >{/if}
