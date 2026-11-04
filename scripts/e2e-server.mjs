// Isolated production server with disposable test-only credentials and data.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { scryptSync } from 'node:crypto';
import webpush from 'web-push';
// Transport stub: browser tests never contact an external push service.
webpush.sendNotification = async () => ({ statusCode: 201, headers: {}, body: '' });
const root = resolve('.test-data');
await mkdir(root, { recursive: true });
process.env.DATA_DIR = await mkdtemp(join(root, 'e2e-'));
// The established UI suite explicitly exercises German. Language tests switch
// this isolated installation and restore the preference after each test.
await writeFile(join(process.env.DATA_DIR, 'preferences.json'), JSON.stringify({ language: 'de' }));
const salt = '0123456789abcdef0123456789abcdef';
process.env.PASSWORD_HASH = `scrypt:${salt}:${scryptSync('nahbei-browser-tests-only', salt, 64).toString('hex')}`;
process.env.SESSION_SECRET = 'browser-test-only-session-secret-not-for-production';
process.env.ORIGIN = 'http://127.0.0.1:4173';
process.env.PORT = '4173';
process.env.HOST = '127.0.0.1';
process.env.COOKIE_SECURE = 'false';
process.env.BODY_SIZE_LIMIT = '110M';
// Test failure handling against a closed local port, never an external SMTP service.
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.SMTP_FROM = 'sender@example.test';
process.env.SMTP_TO = 'recipient@example.test';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
export const { server, shutdown } = await import('../server.mjs');
