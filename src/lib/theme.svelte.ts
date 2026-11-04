export type ThemePreference = 'light' | 'dark' | 'system';
export const appearance = $state({ preference: 'system' as ThemePreference, dark: false });
const storageKey = 'nahbei-theme';
function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    /* The selection still works for this session if storage is blocked. */
  }
  return 'system';
}
function apply() {
  appearance.dark =
    appearance.preference === 'dark' ||
    (appearance.preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = appearance.dark ? 'dark' : 'light';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', appearance.dark ? '#141916' : '#f6f5f0');
}
export function setTheme(preference: ThemePreference) {
  appearance.preference = preference;
  try {
    localStorage.setItem(storageKey, preference);
  } catch {
    /* Keep session choice. */
  }
  apply();
}
export function initializeTheme() {
  appearance.preference = readPreference();
  apply();
  const media = matchMedia('(prefers-color-scheme: dark)');
  const sync = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      appearance.preference = readPreference();
      apply();
    }
  };
  media.addEventListener('change', apply);
  window.addEventListener('storage', sync);
  return () => {
    media.removeEventListener('change', apply);
    window.removeEventListener('storage', sync);
  };
}
