<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { enhanceForm } from '#lib/client';
  import Brand from '#lib/components/Brand.svelte';
  import { APP_NAME, APP_TAGLINE } from '#lib/brand';
  let { form } = $props();
  let busy = $state(false);
</script>

<svelte:head><title>{t('Willkommen ·')} {APP_NAME}</title></svelte:head>
<main class="login-page">
  <div class="login-story">
    <div class="login-brand">
      <Brand />
      <p class="brand-tagline">{APP_TAGLINE}</p>
    </div>
    <div class="login-copy">
      <p class="eyebrow">{t('KONTAKTE MIT GEDÄCHTNIS')}</p>
      <h1>
        {t('Du musst dir')}<br />{t('nicht alles merken.')}<br /><span>{t('Das hier schon.')}</span>
      </h1>
      <p>{t('Kein Netzwerk, kein Feed. Nur du und die Leute, an die du denkst.')}</p>
    </div>
  </div>
  <div class="login-form">
    <h2>{t('Willkommen zurück.')}</h2>
    <p class="muted">{t('Heute was fällig? Schau rein.')}</p>
    <form method="POST" use:enhanceForm={{ onbusy: (b) => (busy = b) }} class="form-stack">
      {#if form?.error}<p class="notice error" role="alert">{form.error}</p>{/if}<label
        >{t('Dein Passwort')}
        <input
          type="password"
          name="password"
          autocomplete="current-password"
          required
          maxlength="1024"
        /></label
      ><button class="button primary" disabled={busy}
        >{busy ? t('Einen Moment …') : t('Anmelden')}</button
      >
    </form>
    <p class="field-help">{t('Deine Daten bleiben auf deinem Server.')}</p>
  </div>
</main>
