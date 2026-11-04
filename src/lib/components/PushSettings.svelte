<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { enhanceForm } from '#lib/client';
  import Icon from './Icon.svelte';
  import { APP_NAME } from '#lib/brand';

  type Device = {
    id: string;
    label: string;
    createdAt: string;
    lastSuccessAt?: string;
    error?: string;
  };
  let { publicKey, devices }: { publicKey: string; devices: Device[] } = $props();
  let ready = $state(false),
    supported = $state(false),
    secure = $state(false),
    ios = $state(false),
    standalone = $state(false);
  let permission = $state<NotificationPermission>('default'),
    currentId = $state<string | null>(null);
  let label = $state(t('Dieses Gerät')),
    busy = $state(false),
    error = $state(''),
    message = $state('');
  const active = $derived(!!currentId && devices.some((device) => device.id === currentId));

  async function api(
    body: Record<string, unknown>
  ): Promise<{ id?: string | null; success?: boolean }> {
    const response = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || t('Die Anfrage konnte nicht verarbeitet werden.'));
    return result;
  }
  function publicKeyBytes(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) =>
      char.charCodeAt(0)
    );
  }
  async function registration(): Promise<ServiceWorkerRegistration> {
    await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    let timeout: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  t(
                    'Die Gerätefreigabe dauert zu lange. Bitte die Seite neu laden und erneut versuchen.'
                  )
                )
              ),
            12000
          );
        })
      ]);
    } finally {
      clearTimeout(timeout!);
    }
  }
  async function initialize() {
    secure = window.isSecureContext;
    ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      !!(navigator as Navigator & { standalone?: boolean }).standalone;
    supported =
      secure && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    label = /iPad/.test(navigator.userAgent)
      ? 'iPad'
      : ios
        ? 'iPhone'
        : /Android/.test(navigator.userAgent)
          ? 'Android'
          : /Mac/.test(navigator.platform)
            ? t('Mein Mac')
            : t('Mein Computer');
    try {
      if (supported) {
        permission = Notification.permission;
        const existing = await navigator.serviceWorker.getRegistration('/');
        const subscription = await existing?.pushManager.getSubscription();
        if (subscription)
          currentId =
            (await api({ operation: 'status', endpoint: subscription.endpoint })).id ?? null;
        const device = devices.find((device) => device.id === currentId);
        if (device) label = device.label;
      }
    } catch {
      error = t('Der Gerätestatus konnte nicht geladen werden. Bitte erneut versuchen.');
    } finally {
      ready = true;
    }
  }
  onMount(() => {
    void initialize();
  });
  async function enable() {
    busy = true;
    error = '';
    message = '';
    try {
      // Permission must be requested directly from this click, before network awaits (iOS).
      permission = await Notification.requestPermission();
      if (permission !== 'granted')
        throw new Error(
          permission === 'denied'
            ? t(
                'Benachrichtigungen wurden blockiert. Du kannst sie in den Browser- oder Geräteeinstellungen wieder erlauben.'
              )
            : t('Die Freigabe wurde nicht erteilt. Du kannst es erneut versuchen.')
        );
      const worker = await registration();
      let subscription = await worker.pushManager.getSubscription();
      if (subscription) {
        const existingKey = subscription.options.applicationServerKey;
        const matches =
          existingKey &&
          btoa(String.fromCharCode(...new Uint8Array(existingKey)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '') === publicKey;
        if (!matches || !active) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
      subscription ??= await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKeyBytes(publicKey)
      });
      currentId =
        (await api({ operation: 'subscribe', label, subscription: subscription.toJSON() })).id ??
        null;
      await invalidateAll();
      message = t('Dieses Gerät ist verbunden. Du kannst jetzt eine Testnachricht senden.');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : t('Push konnte nicht eingerichtet werden.');
    } finally {
      busy = false;
    }
  }
  async function test() {
    busy = true;
    error = '';
    message = '';
    try {
      await api({ operation: 'test', id: currentId });
      message = t(
        'Testnachricht an den Push-Dienst übergeben. Sie sollte gleich auf diesem Gerät erscheinen.'
      );
    } catch (cause) {
      error = (cause as Error).message;
    } finally {
      try {
        await invalidateAll();
      } catch {
        error ||= t('Status konnte nicht aktualisiert werden. Bitte die Seite neu laden.');
      }
      busy = false;
    }
  }
  async function disable() {
    busy = true;
    error = '';
    message = '';
    try {
      await api({ operation: 'unsubscribe', id: currentId });
      currentId = null;
      const worker = await navigator.serviceWorker.getRegistration('/');
      await (await worker?.pushManager.getSubscription())?.unsubscribe();
      message = t('Push auf diesem Gerät deaktiviert.');
    } catch (cause) {
      error = (cause as Error).message;
    } finally {
      try {
        await invalidateAll();
      } catch {
        error ||= t('Status konnte nicht aktualisiert werden. Bitte die Seite neu laden.');
      }
      busy = false;
    }
  }
</script>

<section class="panel settings-card push-settings">
  <div class="section-heading">
    <h2><Icon name="bell" />{t('Push auf deinen Geräten')}</h2>
    <span class="tag" class:ready={active}
      >{active
        ? t('Auf diesem Gerät aktiv')
        : devices.length === 1
          ? t('1 Gerät verbunden')
          : t('{p0} Geräte verbunden', { p0: devices.length })}</span
    >
  </div>
  <p class="muted">
    {t(
      'Deine tägliche Übersicht direkt aufs Handy oder den Computer. Die Nachricht zeigt nur die Anzahl deiner Erinnerungen; Details öffnest du in {p0}',
      { p0: APP_NAME }
    )}
  </p>
  {#if error}<p class="notice error" role="alert">{error}</p>{/if}
  {#if message}<p class="notice success" role="status">{message}</p>{/if}
  {#if !ready}<p class="muted small">{t('Dieses Gerät wird geprüft …')}</p>
  {:else if !secure}<p class="notice info">
      {t(
        'Push benötigt eine HTTPS-Adresse. Auf dem Computer ist auch localhost zum Entwickeln möglich. Öffne {p0} auf deinem Handy über die HTTPS-Adresse deiner Instanz.',
        { p0: APP_NAME }
      )}
    </p>
  {:else if ios && !standalone}<div class="notice info">
      <strong>{t('Auf dem iPhone oder iPad')}</strong>
      <p>
        {t(
          'Öffne diese Seite in Safari, wähle „Teilen“ → „Zum Home-Bildschirm“ und starte {p0} anschließend über das neue Symbol. Dort kannst du Push erlauben.',
          { p0: APP_NAME }
        )}
      </p>
    </div>
  {:else if !supported}<p class="notice info">
      {t(
        'Dieser Browser unterstützt hier keine Push-Benachrichtigungen. Nutze einen aktuellen Browser; auf iPhone und iPad wird mindestens iOS/iPadOS 16.4 benötigt.'
      )}
    </p>
  {:else}
    {#if permission === 'denied'}<p class="notice info">
        {t(
          'Benachrichtigungen sind für {p0} blockiert. Erlaube sie in den Browser- oder Geräteeinstellungen und lade diese Seite neu.',
          { p0: APP_NAME }
        )}
      </p>{/if}
    {#if active}<div class="push-buttons">
        <button class="button primary" disabled={busy || permission !== 'granted'} onclick={test}
          ><Icon name="bell" size={17} />{t('Testnachricht senden')}</button
        ><button class="button secondary" disabled={busy} onclick={disable}
          >{t('Auf diesem Gerät deaktivieren')}</button
        >
      </div>
    {:else}<div class="push-connect">
        <label
          >{t('Gerätename')}
          <input
            bind:value={label}
            maxlength="80"
            placeholder={t('Zum Beispiel: Mein iPhone')}
          /></label
        ><button
          class="button primary"
          disabled={busy || !label.trim() || permission === 'denied'}
          onclick={enable}>{busy ? t('Verbindet …') : t('Auf diesem Gerät aktivieren')}</button
        >
      </div>{/if}
  {/if}
  {#if devices.length}<div class="push-devices">
      <h3>{t('Verbundene Geräte')}</h3>
      {#each devices as device}<div class="push-device">
          <div>
            <strong>{device.label}</strong>{#if device.id === currentId}<span class="tag"
                >{t('Dieses Gerät')}</span
              >{/if}
            <p class="field-help">
              {device.lastSuccessAt
                ? t('Zuletzt an den Push-Dienst übergeben: {p0}', {
                    p0: new Intl.DateTimeFormat('de', {
                      dateStyle: 'short',
                      timeStyle: 'short'
                    }).format(new Date(device.lastSuccessAt))
                  })
                : t('Noch keine Nachricht versendet.')}
            </p>
            {#if device.error}<p class="delivery-error">{device.error}</p>{/if}
          </div>
          <form method="POST" action="?/removePush" use:enhanceForm>
            <input type="hidden" name="id" value={device.id} /><button
              class="text-button"
              aria-label={t('{p0} trennen', { p0: device.label })}>{t('Trennen')}</button
            >
          </form>
        </div>{/each}
    </div>{/if}
  <p class="field-help push-explanation">
    {t(
      'Du kannst mehrere Geräte verbinden. Die Uhrzeit und Zeitzone unten gelten für Push und E-Mail. Geräteschlüssel bleiben auf deinem Server und sind nicht im JSON-Download enthalten.'
    )}
  </p>
</section>
