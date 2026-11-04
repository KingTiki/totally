<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { APP_NAME } from '#lib/brand';
  import Wordmark from './Wordmark.svelte';
  let { class: className = '' }: { class?: string } = $props();
</script>

<a href="/" class={`brand ${className}`} aria-label={t('{p0} Startseite', { p0: APP_NAME })}>
  <Wordmark />
</a>
