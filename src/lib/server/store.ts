import { t } from './language.ts';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyDatabase, type Database } from '../model.ts';
import { validateDatabase } from './validation.ts';
import { PhotoFiles, photoIds, photoHash, validPhotoBytes } from './photo-files.ts';

async function syncDirectory(path: string): Promise<void> {
  // Windows does not expose directory fsync through this API.
  if (process.platform === 'win32') return;
  const directory = await open(path, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export type StoreOptions = {
  rename?: typeof rename;
  syncDirectory?: typeof syncDirectory;
  filename?: string;
  backupDirectory?: string;
};
type StoreHooks<T> = {
  prepare?: (data: T, previous?: T) => Promise<T>;
  committed?: (data: T) => Promise<void>;
};

export class JsonFileStore<T extends object> {
  readonly directory: string;
  private data!: T;
  private queue: Promise<unknown> = Promise.resolve();
  private replace: typeof rename;
  private directorySync: typeof syncDirectory;
  private failure?: Error;
  private validate: (input: unknown) => T;
  private create: () => T;
  private hooks: StoreHooks<T>;
  private filename: string;
  private backupDirectory: string;
  constructor(
    directory: string,
    validate: (input: unknown) => T,
    create: () => T,
    options: StoreOptions = {},
    hooks: StoreHooks<T> = {}
  ) {
    this.directory = resolve(directory);
    this.replace = options.rename ?? rename;
    this.directorySync = options.syncDirectory ?? syncDirectory;
    this.validate = validate;
    this.create = create;
    this.hooks = hooks;
    this.filename = options.filename ?? 'data.json';
    this.backupDirectory = options.backupDirectory ?? 'backups';
  }
  async load(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let raw: string;
    try {
      raw = await readFile(join(this.directory, this.filename), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // Existing backups with a missing main file require an explicit recovery.
      const backups = await readdir(join(this.directory, this.backupDirectory)).catch(
        (e: NodeJS.ErrnoException) => {
          if (e.code !== 'ENOENT') throw e;
          return [];
        }
      );
      if (backups.length)
        throw new Error(
          t('{p0} fehlt, Sicherungen sind vorhanden. Bitte eine Sicherung wiederherstellen.', {
            p0: this.filename
          })
        );
      const validated = this.validate(this.create());
      const initial = (await this.hooks.prepare?.(validated)) ?? validated;
      await this.persist(initial, false);
      this.data = initial;
      await this.hooks.committed?.(initial);
      return;
    }
    try {
      const validated = this.validate(JSON.parse(raw));
      const prepared = (await this.hooks.prepare?.(validated)) ?? validated;
      // Keep an untouched legacy snapshot before replacing embedded photos with references.
      if (prepared !== validated) await this.persist(prepared, true);
      this.data = prepared;
      await this.hooks.committed?.(prepared);
    } catch (error) {
      throw new Error(
        t('{p0} konnte nicht geladen werden. Die Datei bleibt unverändert. {p1}', {
          p0: this.filename,
          p1: (error as Error).message
        })
      );
    }
  }
  snapshot(): T {
    return this.inspect((data) => structuredClone(data));
  }
  protected inspect<R>(read: (data: T) => R): R {
    if (this.failure) throw this.failure;
    if (!this.data) throw new Error(t('Datenspeicher ist noch nicht geladen.'));
    return read(this.data);
  }
  private exclusive<R>(operation: () => Promise<R>): Promise<R> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
  readSnapshot<R>(read: (data: T) => Promise<R>): Promise<R> {
    // Exports hold a stable snapshot and its photo files until all bytes are read.
    return this.exclusive(() => read(this.snapshot()));
  }
  async update<R>(change: (draft: T) => R | Promise<R>): Promise<R> {
    return this.exclusive(async () => {
      const draft = this.snapshot();
      const result = structuredClone(await change(draft));
      const checked = this.validate(draft);
      const validated = (await this.hooks.prepare?.(checked, this.data)) ?? checked;
      await this.persist(validated, true);
      this.data = validated;
      await this.hooks.committed?.(validated);
      return result;
    });
  }
  async import(input: unknown): Promise<void> {
    const imported = this.validate(input);
    await this.update((draft) => {
      Object.assign(draft, imported);
    });
  }
  private async atomicWrite(path: string, content: string): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(content, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await this.replace(temporary, path);
      try {
        await this.directorySync(dirname(path));
      } catch (cause) {
        // The rename already committed. Do not serve or mutate a stale in-memory state.
        // A restart reads the actual file; never silently overwrite it from the old snapshot.
        this.failure = new Error(
          t(
            'Datei ersetzt, aber Datenträger-Synchronisierung fehlgeschlagen. Anwendung stoppen, Datenträger prüfen und neu starten.'
          ),
          { cause }
        );
        throw this.failure;
      }
    } finally {
      await unlink(temporary).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT')
          console.error(t('Temporäre Datei konnte nicht entfernt werden:'), e.code);
      });
    }
  }
  private async persist(data: T, backup: boolean): Promise<void> {
    const backups = join(this.directory, this.backupDirectory);
    if (backup) {
      await mkdir(backups, { recursive: true, mode: 0o700 });
      const current = await readFile(join(this.directory, this.filename), 'utf8');
      this.validate(JSON.parse(current));
      await this.atomicWrite(
        join(backups, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`),
        current
      );
    }
    await this.atomicWrite(
      join(this.directory, this.filename),
      JSON.stringify(data, null, 2) + '\n'
    );
    if (backup) {
      // A pruning failure must not report a successfully committed write as failed.
      try {
        const files = (await readdir(backups)).filter((f) => f.endsWith('.json')).sort();
        await Promise.all(files.slice(0, -10).map((f) => unlink(join(backups, f))));
      } catch {
        console.error(t('Alte Sicherungen konnten nicht vollständig entfernt werden.'));
      }
    }
  }
}

export class JsonStore extends JsonFileStore<Database> {
  readonly photos: PhotoFiles;
  constructor(directory: string, options: StoreOptions = {}) {
    const photos = new PhotoFiles(directory);
    super(directory, validateDatabase, emptyDatabase, options, {
      prepare: (data, previous) => photos.prepare(data, previous),
      committed: (data) => photos.collect(data)
    });
    this.photos = photos;
  }
  hasPhoto(id: string): boolean {
    return this.inspect((data) => data.people.some((person) => person.photoId === id));
  }
  async restore(input: unknown, images: Map<string, Uint8Array>): Promise<void> {
    const imported = validateDatabase(input);
    const referenced = photoIds(imported);
    if (referenced.size !== images.size || [...referenced].some((id) => !images.has(id)))
      throw new Error(t('Die Sicherung enthält nicht alle zugeordneten Profilfotos.'));
    for (const [id, bytes] of images)
      if (!referenced.has(id) || !validPhotoBytes(bytes) || photoHash(bytes) !== id)
        throw new Error(t('Die Sicherung enthält ein ungültiges Profilfoto.'));
    await this.update(async (draft) => {
      // Validation of the complete archive happens before any files are written.
      for (const [id, bytes] of images) await this.photos.put(bytes, id);
      Object.assign(draft, imported);
    });
  }
}
