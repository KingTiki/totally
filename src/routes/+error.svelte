<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { page } from '$app/state';
</script>

<div class="empty-state">
  <p class="eyebrow">{page.status}</p>
  <h1>{t('Hier geht es gerade nicht weiter.')}</h1>
  <p>{page.error?.message || t('Bitte versuche es erneut.')}</p>
  <a class="button primary" href="/">{t('Zur Übersicht')}</a>
</div>
