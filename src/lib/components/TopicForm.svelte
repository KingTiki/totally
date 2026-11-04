<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import type { Topic } from '#lib/model';
  import { enhanceForm } from '#lib/client';
  let { topic, onsaved }: { topic?: Topic; onsaved: () => void } = $props();
  let error = $state(''),
    busy = $state(false);
</script>

<form
  method="POST"
  action="?/topic"
  class="form-stack"
  use:enhanceForm={{
    onsaved,
    onerror: (message) => (error = message),
    onbusy: (value) => (busy = value)
  }}
>
  <input type="hidden" name="operation" value="save" />
  {#if topic}<input type="hidden" name="id" value={topic.id} /><input
      type="hidden"
      name="version"
      value={topic.updatedAt}
    />{/if}
  {#if error}<p class="notice error" role="alert">{error}</p>{/if}
  <label
    >{t('Thema')}
    <input
      name="title"
      value={topic?.title || ''}
      required
      maxlength="200"
      placeholder={t('Zum Beispiel: Wohnungssuche')}
    /></label
  >
  <label
    >{t('Worum geht es?')}
    <textarea
      name="description"
      rows="4"
      maxlength="50000"
      placeholder={t('Was beschäftigt diese Person gerade?')}>{topic?.description || ''}</textarea
    ></label
  >
  <p class="field-help">
    {t('Weitere Entwicklungen kannst du als Notiz oder Kontakt diesem Thema zuordnen.')}
  </p>
  <div class="form-footer">
    <span></span><button class="button primary" disabled={busy}
      >{busy ? t('Speichert …') : topic ? t('Änderungen speichern') : t('Thema anlegen')}</button
    >
  </div>
</form>
