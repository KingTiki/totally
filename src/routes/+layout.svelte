<script lang="ts">
  import { provideTranslations } from '#lib/i18n/context';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { appearance, initializeTheme, setTheme } from '../lib/theme.svelte.ts';
  import Icon from '#lib/components/Icon.svelte';
  import Brand from '#lib/components/Brand.svelte';
  import Wordmark from '#lib/components/Wordmark.svelte';
  import { APP_NAME, APP_TAGLINE } from '#lib/brand';
  import '#lib/styles.css';
  let { data, children } = $props();
  const t = provideTranslations(() => data.language ?? 'en');
  $effect(() => {
    document.documentElement.lang = data.language ?? 'en';
  });
  onMount(initializeTheme);
  const navigation = $derived([
    { href: '/', label: t('Demnächst'), icon: 'upcoming' },
    { href: '/personen', label: t('Personen'), icon: 'people' },
    { href: '/kalender', label: t('Kalender'), icon: 'calendar' },
    { href: '/einstellungen', label: t('Einstellungen'), icon: 'settings' }
  ]);
</script>

<svelte:head
  ><title>{APP_NAME} · {APP_TAGLINE}</title><meta
    name="description"
    content={t('{p0} Dein persönlicher Ort für Menschen, Erinnerungen und offene Fäden.', {
      p0: APP_TAGLINE
    })}
  /></svelte:head
>
{#if data.authenticated}
  <a href="#inhalt" class="skip-link">{t('Zum Inhalt')}</a>
  <aside class="sidebar">
    <Brand />
    <p class="sidebar-caption">{APP_TAGLINE}</p>
    <nav aria-label={t('Hauptnavigation')}>
      {#each navigation as item}<a
          href={item.href}
          class:active={item.href === '/'
            ? page.url.pathname === '/'
            : page.url.pathname.startsWith(item.href)}
          aria-current={(
            item.href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(item.href)
          )
            ? 'page'
            : undefined}
          ><Icon name={item.icon} /><span>{item.label}</span>{#if item.href === '/personen'}<span
              class="nav-count">{data.peopleCount}</span
            >{/if}</a
        >{/each}
    </nav>
    <div class="sidebar-bottom">
      <form action="/abmelden" method="POST">
        <button class="text-button"><Icon name="logout" size={17} />{t('Abmelden')}</button>
      </form>
    </div>
  </aside>
  <div class="app-shell">
    <header class="topbar">
      <time class="topbar-date" datetime={data.today}
        >{new Intl.DateTimeFormat('de-DE', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC'
        }).format(new Date(data.today + 'T12:00:00Z'))}</time
      ><time class="mobile-date" datetime={data.today}
        >{new Intl.DateTimeFormat('de-DE', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC'
        }).format(new Date(data.today + 'T12:00:00Z'))}</time
      ><button
        class="icon-button theme-toggle"
        type="button"
        aria-label={appearance.dark ? t('Hellmodus aktivieren') : t('Dunkelmodus aktivieren')}
        title={appearance.dark ? t('Hellmodus aktivieren') : t('Dunkelmodus aktivieren')}
        onclick={() => setTheme(appearance.dark ? 'light' : 'dark')}
        ><Icon name={appearance.dark ? 'sun' : 'moon'} size={18} /></button
      >
    </header>
    <main id="inhalt">{@render children()}</main>
    <footer class="app-footer">
      <span>{data.footerPhrase}</span><span class="footer-brand"><Wordmark /> in touch</span>
    </footer>
  </div>
{:else}{@render children()}{/if}
