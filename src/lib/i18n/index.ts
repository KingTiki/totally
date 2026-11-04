import { de } from './de.ts';
import { en } from './en.ts';

export type Language = 'en' | 'de';
export type MessageKey = keyof typeof de;
type Parameters<Key extends string> = Key extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Parameters<Rest>
  : never;
type Values = Record<string, string | number>;
type Arguments<Key extends MessageKey> = [Parameters<Key>] extends [never]
  ? [values?: never]
  : [values: Record<Parameters<Key>, string | number>];

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'de';
}

export function translator(language: Language | (() => Language)) {
  const current = () => (typeof language === 'function' ? language() : language);
  function t<Key extends MessageKey>(key: Key, ...args: Arguments<Key>): string {
    const template = current() === 'de' ? de[key] : en[key];
    const values = args[0] as Values | undefined;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(values?.[name] ?? `{${name}}`)
    );
  }
  // These are historical stored contact-type values, not user-authored text.
  // Preserve the stored values while translating their labels in forms/history.
  const contactTypes = [
    'Gesprochen',
    'Telefoniert',
    'Getroffen',
    'Geschrieben',
    'Videoanruf'
  ] as const;
  return Object.assign(t, {
    language: current,
    contactType(value: string): string {
      const key = contactTypes.find((type) => type === value);
      return key ? t(key) : value;
    },
    footer(value: string): string {
      return current() === 'en' && Object.hasOwn(en, value) ? en[value as MessageKey] : value;
    }
  });
}

export type Translator = ReturnType<typeof translator>;
