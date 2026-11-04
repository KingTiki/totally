<script lang="ts">
  import { initials } from '#lib/dates';
  import { photoSource } from '#lib/photo';
  let {
    person,
    class: className = ''
  }: {
    person: { name: string; photo?: string; photoId?: string };
    class?: string;
  } = $props();
  const source = $derived(photoSource(person));
</script>

<span class={`avatar ${className}`} aria-hidden="true">
  {#if source}<img src={source} alt="" loading="lazy" decoding="async" />
  {:else}{initials(person.name)}{/if}
</span>
