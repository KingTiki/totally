<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { appearance, setTheme, type ThemePreference } from '../theme.svelte.ts';
  import Icon from './Icon.svelte';
  const choices: { value: ThemePreference; label: string; icon: string }[] = $derived([
    { value: 'light', label: t('Hell'), icon: 'sun' },
    { value: 'dark', label: t('Dunkel'), icon: 'moon' },
    { value: 'system', label: t('Wie das Gerät'), icon: 'monitor' }
  ]);
</script>

<section class="panel appearance-card">
  <div>
    <h2>{t('Darstellung')}</h2>
    <p class="muted small">{t('Deine Auswahl wird für diesen Browser gespeichert.')}</p>
  </div>
  <fieldset class="theme-picker">
    <legend class="sr-only">{t('Farbschema')}</legend>
    {#each choices as choice}<label class:chosen={appearance.preference === choice.value}>
        <input
          type="radio"
          name="theme"
          value={choice.value}
          checked={appearance.preference === choice.value}
          onchange={() => setTheme(choice.value)}
        />
        <Icon name={choice.icon} size={18} /><span>{choice.label}</span>
      </label>{/each}
  </fieldset>
</section>
