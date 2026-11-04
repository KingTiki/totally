<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import Icon from './Icon.svelte';
  import { normalizeTags, tagKey } from '#lib/tags';
  let {
    selected = $bindable<string[]>([]),
    available = []
  }: { selected?: string[]; available?: string[] } = $props();
  let query = $state(''),
    error = $state('');
  const inputId = $props.id();
  const known = $derived(normalizeTags(available).sort((a, b) => a.localeCompare(b, 'de')));
  const suggestions = $derived(
    known.filter(
      (tag) =>
        !selected.some((value) => tagKey(value) === tagKey(tag)) &&
        tagKey(tag).includes(tagKey(query))
    )
  );
  // Include unfinished text on submit, also when there was no blur event.
  const submitted = $derived(normalizeTags([...selected, ...query.split(',')], known));
  const exact = $derived([...known, ...selected].some((tag) => tagKey(tag) === tagKey(query)));
  function add(values: string[]) {
    const result = normalizeTags([...selected, ...values], known);
    if (result.length > 30 || result.some((tag) => tag.length > 60)) {
      error = t('Maximal 30 Tags mit jeweils bis zu 60 Zeichen.');
      return false;
    }
    selected = result;
    error = '';
    return true;
  }
  function choose(tag: string) {
    if (add([tag])) query = '';
  }
  function commit() {
    if (add(query.split(','))) query = '';
  }
  function typing(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    error = '';
    if (query.includes(',')) {
      const parts = query.split(','),
        last = parts.pop()!;
      if (add(parts)) query = last.trimStart();
    }
  }
</script>

<div class="tag-picker">
  <label for={inputId}>{t('Tags')}</label>
  {#if selected.length}<div class="selected-tags" aria-label={t('Ausgewählte Tags')}>
      {#each selected as tag}<button
          type="button"
          class="tag selected-tag"
          aria-label={t('Tag {p0} entfernen', { p0: tag })}
          onclick={() => (selected = selected.filter((value) => value !== tag))}
          >{tag}<Icon name="close" size={12} /></button
        >{/each}
    </div>{/if}
  <input
    id={inputId}
    type="text"
    value={query}
    placeholder={t('Tag suchen oder neu hinzufügen')}
    maxlength="2000"
    autocomplete="off"
    aria-describedby={`${inputId}-help`}
    oninput={typing}
    onkeydown={(event) => {
      if (event.key === 'Enter' && query.trim()) {
        event.preventDefault();
        commit();
      }
    }}
  />
  <input type="hidden" name="tags" value={submitted.join(', ')} />
  {#if suggestions.length || (query.trim() && !exact)}<div
      class="tag-suggestions"
      aria-label={t('Vorhandene Tags')}
    >
      {#each suggestions as tag}<button
          type="button"
          class="tag tag-suggestion"
          onclick={() => choose(tag)}
          aria-label={t('Tag {p0} auswählen', { p0: tag })}
          ><Icon name="plus" size={12} />{tag}</button
        >{/each}
      {#if query.trim() && !exact}<button type="button" class="tag tag-create" onclick={commit}
          >{t('„{p0}“ hinzufügen', { p0: query.trim() })}</button
        >{/if}
    </div>{/if}
  <p class="field-help" id={`${inputId}-help`}>
    {t('Vorhandene Tags auswählen. Neue Tags mit Enter oder Komma hinzufügen.')}
  </p>
  {#if error}<p class="photo-error" role="alert">{error}</p>{/if}
</div>
