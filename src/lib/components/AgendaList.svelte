<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import type { AgendaItem, Person } from '#lib/model';
  import { addDays, daysBetween, formatDate } from '#lib/dates';
  import Avatar from './Avatar.svelte';
  import { enhanceForm } from '#lib/client';
  import Icon from './Icon.svelte';
  let {
    items,
    people,
    today,
    compact = false,
    weekly = false,
    oncontact
  }: {
    items: AgendaItem[];
    people: Person[];
    today: string;
    compact?: boolean;
    weekly?: boolean;
    oncontact?: (ids: string[]) => void;
  } = $props();
  let error = $state('');
  function groupKey(date: string) {
    if (date < today) return 'overdue';
    if (!weekly || date === today) return date;
    const weekday = new Date(today + 'T12:00:00Z').getUTCDay() || 7;
    const week = Math.floor((daysBetween(today, date) + weekday - 1) / 7);
    return [t('Diese Woche'), t('Nächste Woche'), t('In zwei Wochen')][week] || t('Später');
  }
  function when(date: string) {
    const days = daysBetween(today, date);
    return days < 0
      ? days === -1
        ? t('Seit 1 Tag')
        : t('Seit {p0} Tagen', { p0: Math.abs(days) })
      : days === 0
        ? t('Heute')
        : days === 1
          ? t('Morgen')
          : t('in {p0} Tagen', { p0: days });
  }
  const groupTitle = (date: string) =>
    date < today
      ? t('Noch offen')
      : date === today
        ? t('Heute')
        : date === addDays(today, 1)
          ? t('Morgen')
          : formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
  const groups = $derived([...new Set(items.map((item) => groupKey(item.date)))]);
</script>

{#if error}<p class="notice error" role="alert">{error}</p>{/if}
{#each groups as group}
  <section class:compact class="agenda-group">
    <h3 class="group-label">
      {group === 'overdue' ? t('Noch offen') : /^\d{4}-/.test(group) ? groupTitle(group) : group}
      <span>{items.filter((i) => groupKey(i.date) === group).length}</span>
    </h3>
    <div class="agenda-rows">
      {#each items.filter((i) => groupKey(i.date) === group) as item (item.key)}
        {@const person = people.find((p) => p.id === item.personIds[0])}
        <div class="agenda-item">
          <time
            class="agenda-date"
            datetime={item.date}
            aria-label={formatDate(item.date, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
          >
            <b>{Number(item.date.slice(8))}</b>
            <span
              >{formatDate(item.date, { weekday: 'short' }).replace('.', '')} · {formatDate(
                item.date,
                { month: 'short' }
              ).replace('.', '')}</span
            >
          </time>
          <article class="agenda-row">
            <div class:ochre={item.kind === 'birthday'} class="event-mark">
              <Icon name={item.kind === 'birthday' ? 'cake' : 'bell'} size={21} />
            </div>
            <div class="event-content">
              <h4>{item.title}</h4>
              <div class="event-meta">
                {#if person}<a href={`/personen/${person.id}`}
                    ><Avatar {person} class="tiny-avatar" />{people
                      .filter((p) => item.personIds.includes(p.id))
                      .map((p) => p.name)
                      .join(', ')}</a
                  ><span class="dot">·</span>{/if}<span>{item.detail}</span
                >{#if item.date < today}<span class="overdue"
                    >{t('Seit')} {formatDate(item.date)}</span
                  >{/if}
              </div>
            </div>
            <div class="event-footer">
              <span
                class="event-when"
                class:birthday={item.kind === 'birthday'}
                class:overdue={item.date < today}
                ><span class="mobile-event-date"
                  >{`${formatDate(item.date, { weekday: 'short' }).replace('.', '')}, ${formatDate(item.date, { day: 'numeric', month: 'short' })} · `}
                </span>{when(item.date)}</span
              >
              <div class="row-actions">
                {#if item.kind === 'birthday'}<a
                    class="button subtle small-button"
                    href={`/personen/${item.id}`}>{t('Profil')} <Icon name="arrow" size={16} /></a
                  >
                {:else}
                  {#if oncontact && item.personIds.length}<button
                      class="icon-button contact-action"
                      title={t('Kontakt festhalten')}
                      aria-label={t('Kontakt zu {p0} festhalten', {
                        p0: person?.name || t('Person')
                      })}
                      onclick={() => oncontact?.(item.personIds)}
                      ><Icon name="contact" size={18} /></button
                    >{/if}
                  <details class="action-menu">
                    <summary
                      class="icon-button"
                      title={t('Verschieben oder pausieren')}
                      aria-label={t('{p0}: verschieben oder pausieren', { p0: item.title })}
                      ><Icon name="clock" size={18} /></summary
                    >
                    <div class="action-popover">
                      {#if oncontact && item.personIds.length}<button
                          class="text-button mobile-contact-action"
                          type="button"
                          onclick={() => oncontact?.(item.personIds)}
                          ><Icon name="contact" size={18} />{t('Kontakt festhalten')}</button
                        >{/if}
                      <form
                        method="POST"
                        action="?/reminder"
                        use:enhanceForm={{ onerror: (m) => (error = m) }}
                      >
                        <input type="hidden" name="id" value={item.id} /><input
                          type="hidden"
                          name="occurrence"
                          value={item.occurrence}
                        /><input type="hidden" name="operation" value="snooze" /><label
                          >{t('Verschieben auf')}
                          <input
                            lang="de"
                            type="date"
                            name="until"
                            min={today}
                            value={addDays(today, 1)}
                            required
                          /></label
                        ><button class="button secondary small-button">{t('Verschieben')}</button>
                      </form>
                      <form
                        method="POST"
                        action="?/reminder"
                        use:enhanceForm={{ onerror: (m) => (error = m) }}
                      >
                        <input type="hidden" name="id" value={item.id} /><input
                          type="hidden"
                          name="operation"
                          value="pause"
                        /><button class="text-button">{t('Erinnerung pausieren')}</button>
                      </form>
                    </div>
                  </details>
                  <form
                    method="POST"
                    action="?/reminder"
                    use:enhanceForm={{ onerror: (m) => (error = m) }}
                  >
                    <input type="hidden" name="id" value={item.id} /><input
                      type="hidden"
                      name="occurrence"
                      value={item.occurrence}
                    /><input type="hidden" name="operation" value="complete" /><button
                      class="complete-button"
                      aria-label={t('{p0} erledigen', { p0: item.title })}
                      title={t('Erledigt')}><Icon name="check" size={18} /></button
                    >
                  </form>
                {/if}
              </div>
            </div>
          </article>
        </div>
      {/each}
    </div>
  </section>
{/each}
