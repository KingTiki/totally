import { getContext, setContext } from 'svelte';
import { translator, type Language, type Translator } from './index.ts';

const languageContext = Symbol('totally.language');

export function provideTranslations(language: () => Language): Translator {
  const t = translator(language);
  setContext(languageContext, t);
  return t;
}

export function useTranslations(): Translator {
  return getContext<Translator>(languageContext) ?? translator('en');
}
