<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import type { Person } from '#lib/model';
  import { enhanceForm } from '#lib/client';
  import Icon from './Icon.svelte';
  let {
    people,
    onsaved,
    label = t('In den Papierkorb')
  }: {
    people: Person[];
    onsaved?: () => void;
    label?: string;
  } = $props();
  let busy = $state(false),
    error = $state('');
  function confirmTrash(data: FormData) {
    const names =
      people.length === 1
        ? `„${people[0].name}“`
        : t('{p0} ausgewählte Kontakte', { p0: people.length });
    if (
      !window.confirm(
        t(
          '{p0} in den Papierkorb verschieben?\n\nDu kannst sie unter Einstellungen → Papierkorb wiederherstellen. Zugehörige Erinnerungen ruhen bis dahin.',
          { p0: names }
        )
      )
    )
      return false;
    data.set('confirm', 'on');
    return true;
  }
</script>

<form
  method="POST"
  action="?/trash"
  use:enhanceForm={{
    onsaved,
    onconfirm: confirmTrash,
    onerror: (message) => (error = message),
    onbusy: (value) => (busy = value)
  }}
>
  {#each people as person}
    <input type="hidden" name="personIds" value={person.id} />
    <input type="hidden" name={`version:${person.id}`} value={person.updatedAt} />
  {/each}
  <button class="button secondary" disabled={busy || !people.length}>
    <Icon name="trash" size={16} />{busy ? t('Verschiebt …') : label}
  </button>
  {#if error}<p class="notice error" role="alert">{error}</p>{/if}
</form>
