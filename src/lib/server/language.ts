import { AsyncLocalStorage } from 'node:async_hooks';
import { translator, type Language } from '../i18n/index.ts';

const languageScope = new AsyncLocalStorage<Language>();

// Requests and background jobs each establish their own scope. No process-wide
// mutable locale can leak between concurrent requests or notification jobs.
export function withLanguage<T>(language: Language, action: () => T): T {
  return languageScope.run(language, action);
}

export function currentLanguage(): Language {
  return languageScope.getStore() ?? 'de';
}

export const t = translator(currentLanguage);
