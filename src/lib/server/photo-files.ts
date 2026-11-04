import { t } from './language.ts';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { PHOTO_ID_PATTERN, PHOTO_MAX_BYTES } from '../photo.ts';
import type { Database } from '../model.ts';
import { validPhoto } from './photo.ts';
import { validateDatabase } from './validation.ts';

export const photoIds = (db: Database): Set<string> =>
  new Set(db.people.flatMap((p) => (p.photoId ? [p.photoId] : [])));
export const photoHash = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');
export function validPhotoBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length <= PHOTO_MAX_BYTES &&
    validPhoto(`data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`)
  );
}
async function sync(directory: string) {
  if (process.platform === 'win32') return;
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class PhotoFiles {
  readonly directory: string;
  private root: string;
  constructor(root: string) {
    this.root = resolve(root);
    this.directory = join(this.root, 'photos');
  }
  private path(id: string) {
    if (!PHOTO_ID_PATTERN.test(id)) throw new Error(t('Profilfoto-Verweis ungültig.'));
    return join(this.directory, `${id}.jpg`);
  }
  async read(id: string): Promise<Buffer> {
    const handle = await open(this.path(id), 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > PHOTO_MAX_BYTES)
        throw new Error(t('Profilfoto-Datei ungültig.'));
      const bytes = await handle.readFile();
      if (!validPhotoBytes(bytes) || photoHash(bytes) !== id)
        throw new Error(t('Profilfoto-Datei beschädigt.'));
      return bytes;
    } finally {
      await handle.close();
    }
  }
  async put(bytes: Uint8Array, expected?: string): Promise<string> {
    if (!validPhotoBytes(bytes)) throw new Error(t('Profilfoto ungültig oder zu groß.'));
    const id = photoHash(bytes);
    if (expected !== undefined && id !== expected)
      throw new Error(t('Profilfoto und Bild-ID stimmen nicht überein.'));
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      await this.read(id);
      return id;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const path = this.path(id),
      temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, path);
      await sync(this.directory);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    return id;
  }
  async prepare(db: Database, previous?: Database): Promise<Database> {
    const known = previous ? photoIds(previous) : new Set<string>();
    const people = [];
    let changed = false;
    for (const person of db.people) {
      if (person.photo) {
        const photoId = await this.put(Buffer.from(person.photo.slice(23), 'base64'));
        const { photo: _, ...rest } = person;
        people.push({ ...rest, photoId });
        known.add(photoId);
        changed = true;
      } else {
        if (person.photoId && !known.has(person.photoId)) {
          try {
            await this.read(person.photoId);
          } catch {
            throw new Error(
              t(
                'Profilfoto für {p0} fehlt oder ist beschädigt. Bitte eine vollständige Sicherung wiederherstellen.',
                { p0: person.name }
              )
            );
          }
          known.add(person.photoId);
        }
        people.push(person);
      }
    }
    return changed ? { ...db, people } : db;
  }
  async collect(current: Database): Promise<void> {
    try {
      const files = await readdir(this.directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      if (!files.length) return;
      const retained = photoIds(current);
      const backups = join(this.root, 'backups');
      const snapshots = await readdir(backups).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      // A damaged/unreadable backup aborts cleanup: its photos may still be needed.
      for (const name of snapshots.filter((name) => name.endsWith('.json'))) {
        const backup = validateDatabase(JSON.parse(await readFile(join(backups, name), 'utf8')));
        for (const id of photoIds(backup)) retained.add(id);
      }
      let removed = false;
      for (const file of files) {
        const id = file.slice(0, -4);
        if (file.endsWith('.jpg') && PHOTO_ID_PATTERN.test(id) && !retained.has(id)) {
          await unlink(this.path(id));
          removed = true;
        }
      }
      if (removed) await sync(this.directory);
    } catch {
      // Never report a committed edit as failed or risk deleting referenced photos.
      console.error(t('Bilddateien konnten nicht vollständig aufgeräumt werden.'));
    }
  }
}
