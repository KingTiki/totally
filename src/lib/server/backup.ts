import { t } from './language.ts';
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { crc32 } from 'node:zlib';
import { BACKUP_MAX_BYTES, BACKUP_JSON_MAX_BYTES, BACKUP_EXPANDED_MAX_BYTES } from '../backup.ts';
import { PHOTO_MAX_BYTES } from '../photo.ts';
import { validateDatabase } from './validation.ts';
import { photoIds, photoHash, validPhotoBytes } from './photo-files.ts';
import type { Database } from '../model.ts';
import type { JsonStore } from './store.ts';

const photoName = /^photos\/([a-f0-9]{64})\.jpg$/;
const decoder = new TextDecoder('utf-8', { fatal: true });
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function json(bytes: Uint8Array): Database {
  let input: unknown;
  try {
    input = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error(t('Die Datei enthält kein gültiges JSON.'));
  }
  return validateDatabase(input);
}

// Preflight the directory before decompression: bound memory, reject duplicate
// names, unsafe paths, encryption and ZIP64; never extract paths to the filesystem.
function zipDirectory(bytes: Uint8Array): Map<string, { size: number; crc: number }> {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = buffer.length - 22;
  let found = false;
  for (; end >= Math.max(0, buffer.length - 65558); end--) {
    if (
      buffer.readUInt32LE(end) === 0x06054b50 &&
      end + 22 + buffer.readUInt16LE(end + 20) === buffer.length
    ) {
      found = true;
      break;
    }
  }
  ensure(found, t('Ungültige ZIP-Sicherung.'));
  const count = buffer.readUInt16LE(end + 10);
  ensure(
    buffer.readUInt16LE(end + 4) === 0 &&
      buffer.readUInt16LE(end + 6) === 0 &&
      buffer.readUInt16LE(end + 8) === count &&
      count > 0 &&
      count <= 10001,
    t('ZIP-Sicherung enthält zu viele Dateien oder mehrere Teile.')
  );
  const start = buffer.readUInt32LE(end + 16),
    length = buffer.readUInt32LE(end + 12);
  ensure(
    start + length === end,
    t('ZIP64 und unvollständige ZIP-Sicherungen werden nicht unterstützt.')
  );
  const entries = new Map<string, { size: number; crc: number }>();
  const ranges: [number, number][] = [];
  let offset = start,
    expanded = 0;
  for (let i = 0; i < count; i++) {
    ensure(
      offset + 46 <= end && buffer.readUInt32LE(offset) === 0x02014b50,
      t('Ungültiges ZIP-Verzeichnis.')
    );
    const flags = buffer.readUInt16LE(offset + 8),
      method = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16),
      compressed = buffer.readUInt32LE(offset + 20),
      size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28),
      extra = buffer.readUInt16LE(offset + 30),
      comment = buffer.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extra + comment,
      local = buffer.readUInt32LE(offset + 42);
    ensure(next <= end, t('Ungültiger ZIP-Dateiname.'));
    const name = decoder.decode(buffer.subarray(offset + 46, offset + 46 + nameLength));
    ensure(
      !entries.has(name) && (name === 'data.json' || name === 'photos/' || photoName.test(name)),
      t('ZIP enthält doppelte oder unerwartete Dateipfade.')
    );
    ensure(
      !(flags & 1) && [0, 8].includes(method) && buffer.readUInt16LE(offset + 34) === 0,
      t('Verschlüsselte oder nicht unterstützte ZIP-Datei.')
    );
    ensure(
      ((buffer.readUInt32LE(offset + 38) >>> 16) & 0o170000) !== 0o120000,
      t('Symbolische Links sind in Sicherungen nicht erlaubt.')
    );
    const limit =
      name === 'data.json' ? BACKUP_JSON_MAX_BYTES : name === 'photos/' ? 0 : PHOTO_MAX_BYTES;
    expanded += size;
    ensure(
      size <= limit && expanded <= BACKUP_EXPANDED_MAX_BYTES,
      t('Entpackte ZIP-Sicherung ist zu groß.')
    );
    ensure(
      local + 30 <= start && buffer.readUInt32LE(local) === 0x04034b50,
      t('Ungültiger ZIP-Dateieintrag.')
    );
    const localNameLength = buffer.readUInt16LE(local + 26),
      dataStart = local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
    ensure(
      dataStart + compressed <= start &&
        decoder.decode(buffer.subarray(local + 30, local + 30 + localNameLength)) === name &&
        buffer.readUInt16LE(local + 8) === method,
      t('Inkonsistenter ZIP-Dateieintrag.')
    );
    if (!(flags & 8))
      ensure(
        buffer.readUInt32LE(local + 14) === crc &&
          buffer.readUInt32LE(local + 18) === compressed &&
          buffer.readUInt32LE(local + 22) === size,
        t('Inkonsistente ZIP-Dateigröße.')
      );
    ranges.push([local, dataStart + compressed]);
    entries.set(name, { size, crc });
    offset = next;
  }
  ensure(
    offset === end && entries.has('data.json'),
    t('Die ZIP-Sicherung muss data.json enthalten.')
  );
  ranges.sort((a, b) => a[0] - b[0]);
  ensure(
    ranges.every((range, i) => i === 0 || ranges[i - 1][1] <= range[0]),
    t('Überlappende ZIP-Dateieinträge.')
  );
  return entries;
}

export function readBackup(bytes: Uint8Array): {
  data: Database;
  photos?: Map<string, Uint8Array>;
} {
  ensure(
    bytes.length > 0 && bytes.length <= BACKUP_MAX_BYTES,
    t('Bitte eine ZIP- oder JSON-Sicherung mit maximal 100 MiB auswählen.')
  );
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { data: json(bytes) };
  try {
    const directory = zipDirectory(bytes);
    const files = unzipSync(bytes, {
      filter: (file) => {
        const entry = directory.get(file.name);
        ensure(entry && entry.size === file.originalSize, t('Inkonsistentes ZIP-Verzeichnis.'));
        return file.name !== 'photos/';
      }
    });
    for (const [name, content] of Object.entries(files)) {
      const entry = directory.get(name)!;
      ensure(
        content.length === entry.size && crc32(content) === entry.crc,
        t('ZIP-Sicherung ist beschädigt (Prüfsumme).')
      );
    }
    const data = json(files['data.json']);
    const referenced = photoIds(data),
      photos = new Map<string, Uint8Array>();
    for (const [name, content] of Object.entries(files)) {
      if (name === 'data.json') continue;
      const id = name.match(photoName)![1];
      ensure(
        referenced.has(id) && validPhotoBytes(content) && photoHash(content) === id,
        t('ZIP enthält ein ungültiges oder nicht zugeordnetes Profilfoto.')
      );
      photos.set(id, content);
    }
    ensure(
      [...referenced].every((id) => photos.has(id)),
      t('In der ZIP-Sicherung fehlt ein Profilfoto.')
    );
    return { data, photos };
  } catch (error) {
    throw new Error(
      t('ZIP-Sicherung konnte nicht gelesen werden. {p0}', { p0: (error as Error).message })
    );
  }
}

export async function createBackup(store: JsonStore): Promise<Uint8Array<ArrayBuffer>> {
  return store.readSnapshot(async (data) => {
    const metadata = new TextEncoder().encode(JSON.stringify(data, null, 2) + '\n');
    ensure(
      metadata.length <= BACKUP_JSON_MAX_BYTES,
      t('Die JSON-Daten überschreiten 32 MiB. Bitte das vollständige Datenvolume sichern.')
    );
    const files: Zippable = { 'data.json': [metadata, { level: 6 }] };
    let total = metadata.length;
    const ids = photoIds(data);
    ensure(
      ids.size <= 10000,
      t('Die Sicherung enthält mehr als 10.000 Bilder. Bitte das vollständige Datenvolume sichern.')
    );
    for (const id of ids) {
      const bytes = await store.photos.read(id);
      total += bytes.length;
      ensure(
        total <= BACKUP_EXPANDED_MAX_BYTES,
        t('Die Sicherung ist zu groß. Bitte das vollständige Datenvolume sichern.')
      );
      files[`photos/${id}.jpg`] = [bytes, { level: 0 }];
    }
    const archive = zipSync(files);
    ensure(
      archive.length <= BACKUP_MAX_BYTES,
      t('Die ZIP-Sicherung überschreitet 100 MiB. Bitte das vollständige Datenvolume sichern.')
    );
    return archive;
  });
}
