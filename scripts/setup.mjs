import { randomBytes, scryptSync } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';

const stdout = process.argv.includes('--stdout');
if (!stdout)
  try {
    await access('.env');
    console.error(
      '.env existiert bereits. Für einen Passwortwechsel PASSWORD_HASH und SESSION_SECRET manuell ersetzen.'
    );
    process.exit(1);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
const password = randomBytes(18).toString('base64url');
const salt = randomBytes(16).toString('hex');
const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
let origin = process.env.ORIGIN || 'http://localhost:3000';
if (!stdout && process.stdin.isTTY) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  origin =
    (await terminal.question('Öffentliche Adresse [http://localhost:3000]: ')).trim() || origin;
  terminal.close();
}
const url = new URL(origin);
if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
  throw new Error('Bitte eine HTTP(S)-Adresse ohne Pfad angeben.');
const content = `PASSWORD_HASH=${hash}
SESSION_SECRET=${randomBytes(32).toString('hex')}
ORIGIN=${origin}
# Nur ohne Docker; Compose verwendet intern 0.0.0.0:3000 und /app/data.
HOST=0.0.0.0
PORT=3000
DATA_DIR=./data
# Docker Compose: Adresse und Port auf dem Host.
BIND_ADDRESS=127.0.0.1
APP_PORT=3000
# Maximale HTTP-Anfragegröße, einschließlich Datei-Uploads.
BODY_SIZE_LIMIT=110M
COOKIE_SECURE=${url.protocol === 'https:'}
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_TO=
`;
if (stdout) {
  process.stdout.write(content);
  console.error(
    `\nDein einmalig angezeigtes Passwort:\n\n${password}\n\nBitte im Passwortmanager speichern.\n`
  );
} else {
  await writeFile('.env', content, { flag: 'wx', mode: 0o600 });
  console.log(
    `\n.env angelegt. Dein einmalig angezeigtes Passwort:\n\n${password}\n\nBitte im Passwortmanager speichern. Start: npm run dev\n`
  );
}
