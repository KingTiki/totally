import { t } from './language.ts';
export function config() {
  const origin = process.env.ORIGIN || 'http://localhost:3000';
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
    throw new Error(
      t('ORIGIN muss eine HTTP(S)-Adresse ohne Pfad oder abschließenden Schrägstrich sein.')
    );
  const passwordHash = process.env.PASSWORD_HASH || '';
  const sessionSecret = process.env.SESSION_SECRET || '';
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash) || sessionSecret.length < 32)
    throw new Error(
      t(
        'Login noch nicht eingerichtet. Bitte zuerst npm run setup ausführen oder PASSWORD_HASH und SESSION_SECRET setzen.'
      )
    );
  if (url.protocol === 'https:' && process.env.COOKIE_SECURE === 'false')
    throw new Error(t('COOKIE_SECURE darf bei HTTPS nicht false sein.'));
  return {
    origin,
    passwordHash,
    sessionSecret,
    secure: process.env.COOKIE_SECURE === 'true' || url.protocol === 'https:',
    directory: process.env.DATA_DIR || './data',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD || '',
      from: process.env.SMTP_FROM || '',
      to: process.env.SMTP_TO || ''
    }
  };
}
