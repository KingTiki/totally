<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { APP_NAME } from '#lib/brand';
  import { addDays, formatDate } from '#lib/dates';
  import Icon from '#lib/components/Icon.svelte';
  import Modal from '#lib/components/Modal.svelte';
  import ReminderForm from '#lib/components/ReminderForm.svelte';
  import AgendaList from '#lib/components/AgendaList.svelte';
  import Notice from '#lib/components/Notice.svelte';
  let { data, form } = $props();
  let creating = $state(false),
    selectedDate = $state('');
  const days = $derived(Array.from({ length: 42 }, (_, i) => addDays(data.start, i)));
  const monthItems = $derived(data.items.filter((i) => i.date.startsWith(data.month)));
  const title = $derived(formatDate(`${data.month}-01`, { month: 'long', year: 'numeric' }));
  function create(date = data.today) {
    selectedDate = date;
    creating = true;
  }
</script>

<svelte:head><title>{t('Kalender ·')} {APP_NAME}</title></svelte:head>
<div class="page-heading">
  <div>
    <p class="eyebrow">{t('ANLÄSSE UND OFFENE FÄDEN')}</p>
    <h1>{t('Dein Kalender')}<span class="heading-dot">.</span></h1>
    <p class="page-description">
      {t('Ein Blick voraus, damit die kleinen Dinge ihren Platz haben.')}
    </p>
  </div>
  <button class="button primary" onclick={() => create()}
    ><Icon name="plus" size={18} />{t('Erinnerung anlegen')}</button
  >
</div>
<Notice {form} />
<div class="calendar-heading">
  <h2>{title}</h2>
  <div class="calendar-controls">
    <a class="button secondary small-button" href="/kalender">{t('Heute')}</a><a
      class="icon-button"
      href={`/kalender?monat=${data.previous}`}
      aria-label={t('Vorheriger Monat')}><Icon name="back" size={18} /></a
    ><a class="icon-button" href={`/kalender?monat=${data.next}`} aria-label={t('Nächster Monat')}
      ><Icon name="arrow" size={18} /></a
    >
  </div>
</div>
<div class="calendar-grid" aria-label={title}>
  <div class="weekdays">
    {#each ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as day}<span>{day}</span>{/each}
  </div>
  <div class="calendar-days">
    {#each days as date}{@const items = data.items.filter((i) => i.date === date)}<button
        class="calendar-day"
        class:outside={!date.startsWith(data.month)}
        class:today={date === data.today}
        aria-label={t('{p0}: {p1} Termine. Erinnerung anlegen', {
          p0: formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' }),
          p1: items.length
        })}
        onclick={() => create(date)}
        ><span class="day-number">{Number(date.slice(8))}</span
        >{#each items.slice(0, 3) as item}<span
            class="calendar-event"
            class:birthday={item.kind === 'birthday'}
            ><Icon name={item.kind === 'birthday' ? 'cake' : 'bell'} size={12} /><span
              >{item.title}</span
            ></span
          >{/each}{#if items.length > 3}<span class="more-events"
            >+ {items.length - 3} {t('weitere')}</span
          >{/if}</button
      >{/each}
  </div>
</div>
<section class="calendar-agenda">
  <div class="section-heading">
    <h2>{t('Alle Termine im')} {formatDate(`${data.month}-01`, { month: 'long' })}</h2>
    <span class="muted small">{monthItems.length} {t('Termine')}</span>
  </div>
  {#if monthItems.length}<AgendaList
      items={monthItems}
      people={data.people}
      today={data.today}
    />{:else}<div class="empty-state panel">
      <Icon name="calendar" size={28} />
      <h3>{t('Noch Platz für schöne Anlässe.')}</h3>
      <p>{t('In diesem Monat sind keine Termine eingetragen.')}</p>
      <button class="button secondary" onclick={() => create(`${data.month}-01`)}
        >{t('Erinnerung anlegen')}</button
      >
    </div>{/if}
</section>
{#if creating}<Modal title={t('Erinnerung anlegen')} onclose={() => (creating = false)}
    ><ReminderForm
      people={data.people}
      today={data.today}
      date={selectedDate}
      onsaved={() => (creating = false)}
    /></Modal
  >{/if}
