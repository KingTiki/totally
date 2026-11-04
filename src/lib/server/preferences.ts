import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isLanguage, type Language } from '../i18n/index.ts';
import { JsonFileStore } from './store.ts';
import { t } from './language.ts';

export type Preferences = { language: Language };

export function validatePreferences(input: unknown): Preferences {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error(t('Ungültige Anwendungseinstellungen.'));
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 1 || !isLanguage(value.language))
    throw new Error(t('Ungültige Sprache. Bitte en oder de verwenden.'));
  return { language: value.language };
}

export async function preferencesStore(directory: string): Promise<JsonFileStore<Preferences>> {
  let language: Language = 'en';
  try {
    await stat(join(directory, 'data.json'));
    language = 'de';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const store = new JsonFileStore(directory, validatePreferences, () => ({ language }), {
    filename: 'preferences.json',
    backupDirectory: 'preferences-backups'
  });
  await store.load();
  return store;
}
