<script lang="ts">
  import { useTranslations } from '#lib/i18n/context';
  const t = useTranslations();
  import { APP_NAME } from '#lib/brand';
  import Icon from '#lib/components/Icon.svelte';
  import Notice from '#lib/components/Notice.svelte';
  import PushSettings from '#lib/components/PushSettings.svelte';
  import ThemePicker from '#lib/components/ThemePicker.svelte';
  import { enhanceForm } from '#lib/client';
  import { formatDate } from '#lib/dates';
  let { data, form } = $props();
  const statuses: Record<string, string> = $derived({
    pending: t('Ausstehend'),
    sent: t('Gesendet'),
    failed: t('Fehlgeschlagen'),
    skipped: t('Keine fälligen Einträge'),
    expired: t('Gerät nicht mehr verbunden')
  });
</script>

<svelte:head><title>{t('Einstellungen ·')} {APP_NAME}</title></svelte:head>
<div class="page-heading">
  <div>
    <p class="eyebrow">{t('DEIN RAUM, DEIN RHYTHMUS')}</p>
    <h1>{t('Einstellungen')}<span class="heading-dot">.</span></h1>
    <p class="page-description">
      {t('Wie du erinnert wirst. Und wie deine Daten bei dir bleiben.')}
    </p>
  </div>
</div>
<Notice {form} />
<section class="panel settings-card language-settings">
  <h2>{t('Sprache')}</h2>
  <p class="muted">
    {t(
      'Gilt auf allen Geräten sowie für neue E-Mails und Push-Nachrichten. Das Datumsformat bleibt unverändert.'
    )}
  </p>
  <form method="POST" action="?/language" use:enhanceForm class="form-stack">
    <label for="application-language">{t('Sprache')}</label>
    <select id="application-language" name="language" value={data.language}>
      <option value="en" lang="en">English</option>
      <option value="de" lang="de">Deutsch</option>
    </select>
    <div class="form-footer">
      <span></span><button class="button primary">{t('Sprache speichern')}</button>
    </div>
  </form>
</section>
<ThemePicker />
<PushSettings publicKey={data.pushPublicKey} devices={data.devices} />
<div class="settings-grid">
  <section class="panel settings-card">
    <div class="section-heading">
      <h2><Icon name="clock" />{t('Dein Erinnerungsrhythmus')}</h2>
      <span class="tag" class:ready={data.smtpConfigured}
        >{data.smtpConfigured ? t('E-Mail bereit') : t('E-Mail optional')}</span
      >
    </div>
    <p class="muted">
      {t(
        'Geburtstage und fällige Wiedervorlagen, einmal täglich gebündelt. Die Uhrzeit gilt für alle verbundenen Push-Geräte. E-Mail kannst du zusätzlich aktivieren.'
      )}
    </p>
    {#if !data.smtpConfigured}<details class="smtp-help">
        <summary>{t('E-Mail zusätzlich einrichten')}</summary>
        <p class="notice info">
          {t(
            'Trage SMTP_HOST, SMTP_FROM und SMTP_TO sowie gegebenenfalls Zugangsdaten in der Umgebung ein und starte die App neu.'
          )}
        </p>
      </details>{:else}<p class="small muted">{t('Empfänger:')} {data.recipient}</p>{/if}
    <form method="POST" action="?/save" use:enhanceForm class="form-stack">
      <label class="check-option toggle-option"
        ><input
          type="checkbox"
          name="emailEnabled"
          checked={data.settings.emailEnabled}
          disabled={!data.smtpConfigured}
        />{t('Tägliche Übersicht zusätzlich per E-Mail')}</label
      >
      <div class="form-grid">
        <label
          >{t('Versandzeit')}
          <input
            lang="de"
            type="time"
            name="digestTime"
            value={data.settings.digestTime}
            required
          /></label
        ><label
          >{t('Zeitzone')}
          <input
            name="timezone"
            value={data.settings.timezone}
            required
            list="timezones"
          /><datalist id="timezones"
            ><option>Europe/Berlin</option><option>Europe/Vienna</option><option
              >Europe/Zurich</option
            ><option>UTC</option></datalist
          ></label
        >
      </div>
      <div class="form-footer">
        <span></span><button class="button primary">{t('Einstellungen speichern')}</button>
      </div>
    </form>
    <form method="POST" action="?/send" use:enhanceForm class="send-now">
      <button
        class="text-button"
        disabled={(!data.smtpConfigured || !data.settings.emailEnabled) && !data.devices.length}
        >{t('Heutige Übersicht jetzt prüfen')} <Icon name="arrow" size={16} /></button
      >
      <p class="field-help">
        {t(
          'Bereits versendete Tagesübersichten werden auf demselben Gerät oder Kanal nicht erneut gesendet. Ohne fällige Einträge bleibt es ruhig.'
        )}
      </p>
    </form>
  </section>
  <section class="panel settings-card">
    <h2><Icon name="download" />{t('Deine Daten')}</h2>
    <p class="muted">
      {t(
        'Sichere deinen vollständigen Datenbestand als ZIP mit lesbarer JSON-Datei und allen Profilfotos. Zugangsdaten und private Push-Schlüssel sind darin nicht enthalten.'
      )}
    </p>
    <a class="button secondary backup-download" href="/export" download
      ><Icon name="download" size={17} />{t('ZIP-Sicherung herunterladen')}</a
    >
    <p>
      <a class="button secondary" href="/einstellungen/papierkorb"
        ><Icon name="trash" size={17} />{t('Papierkorb (')}{data.trashCount})</a
      >
    </p>
    <p class="field-help">{t('Gelöschte Kontakte kannst du im Papierkorb wiederherstellen.')}</p>
    <hr />
    <details class="import-section">
      <summary>{t('Daten wiederherstellen')}</summary>
      <form
        method="POST"
        action="?/import"
        enctype="multipart/form-data"
        use:enhanceForm
        class="form-stack"
      >
        <p class="muted small">
          {t(
            'Der Import ersetzt deinen aktuellen Bestand einschließlich Einstellungen und Versandhistorie. Zuvor wird automatisch eine Sicherung angelegt. ZIP-Sicherungen und ältere JSON-Exporte werden unterstützt, jeweils bis 100 MiB.'
          )}
        </p>
        <label
          >{t('Sicherungsdatei')}
          <input
            type="file"
            name="file"
            accept="application/zip,.zip,application/json,.json"
            required
          /></label
        ><label class="check-option"
          ><input type="checkbox" name="confirm" required />{t(
            'Ich möchte den aktuellen Datenbestand ersetzen.'
          )}</label
        ><button class="button secondary">{t('Prüfen und importieren')}</button>
      </form>
    </details>
    <p class="field-help">
      {t(
        'Die letzten zehn Speicherstände bleiben zusätzlich als lokale Sicherungen erhalten. Bewahre Downloads und externe Sicherungen an einem privaten Ort auf.'
      )}
    </p>
  </section>
</div>
<form action="/abmelden" method="POST" class="settings-logout">
  <button class="text-button"><Icon name="logout" size={17} />{t('Abmelden')}</button>
</form>
<section class="panel settings-card delivery-section">
  <div class="section-heading">
    <h2>{t('Letzte Push-Zustellungen')}</h2>
    <span class="muted small">{t('Bis zu 20 Einträge')}</span>
  </div>
  {#if data.pushDeliveries.length}<div class="delivery-list">
      {#each data.pushDeliveries as delivery}<article class="delivery-row">
          <div>
            <strong
              >{delivery.deviceLabel} · {delivery.kind === 'test'
                ? t('Testnachricht')
                : t('Tagesübersicht')}</strong
            >
            <p class="muted small">
              {formatDate(delivery.date, { day: 'numeric', month: 'long', year: 'numeric' })} · {delivery.attempts}
              {delivery.attempts === 1 ? t('Versuch') : t('Versuche')}
            </p>
            {#if delivery.error}<p class="delivery-error">{delivery.error}</p>{/if}
          </div>
          <span
            class="delivery-status"
            class:failed={delivery.status === 'failed' || delivery.status === 'expired'}
            class:sent={delivery.status === 'sent'}
            >{delivery.status === 'sent'
              ? t('An Push-Dienst übergeben')
              : statuses[delivery.status]}</span
          >
        </article>{/each}
    </div>{:else}<div class="empty-inline">
      <Icon name="bell" size={24} />
      <p>{t('Noch keine Push-Nachrichten versendet.')}</p>
    </div>{/if}
</section>
<section class="panel settings-card delivery-section">
  <div class="section-heading">
    <h2>{t('Letzte E-Mail-Zustellungen')}</h2>
    <span class="muted small">{t('Bis zu 20 Einträge')}</span>
  </div>
  {#if data.deliveries.length}<div class="delivery-list">
      {#each data.deliveries as delivery}<article class="delivery-row">
          <div>
            <strong
              >{formatDate(delivery.date, {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}</strong
            >
            <p class="muted small">
              {delivery.attempts}
              {delivery.attempts === 1 ? t('Versuch') : t('Versuche')}{delivery.status === 'failed'
                ? t(' · Nächster Versuch: {p0}', {
                    p0: new Intl.DateTimeFormat('de', {
                      timeZone: data.settings.timezone,
                      dateStyle: 'short',
                      timeStyle: 'short'
                    }).format(new Date(delivery.nextAttemptAt))
                  })
                : ''}
            </p>
            {#if delivery.error}<p class="delivery-error">{delivery.error}</p>{/if}
          </div>
          <span
            class="delivery-status"
            class:failed={delivery.status === 'failed'}
            class:sent={delivery.status === 'sent'}>{statuses[delivery.status]}</span
          >{#if delivery.status === 'failed'}<form method="POST" action="?/retry" use:enhanceForm>
              <input type="hidden" name="id" value={delivery.id} /><button
                class="button secondary small-button">{t('Erneut versuchen')}</button
              >
            </form>{/if}
        </article>{/each}
    </div>{:else}<div class="empty-inline">
      <Icon name="mail" size={24} />
      <p>{t('Hier siehst du künftig, ob deine Übersichten angekommen sind.')}</p>
    </div>{/if}
</section>
