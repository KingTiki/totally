export const tagKey = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('de');

export function normalizeTags(values: string[], available: string[] = []): string[] {
  const known = new Map<string, string>();
  for (const tag of available) {
    if (tag.trim() && !known.has(tagKey(tag))) known.set(tagKey(tag), tag.trim());
  }
  const selected = new Map<string, string>();
  for (const value of values) {
    const tag = value.trim(),
      key = tagKey(tag);
    if (tag && !selected.has(key)) selected.set(key, known.get(key) ?? tag);
  }
  return [...selected.values()];
}
