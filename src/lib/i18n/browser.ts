import { translator } from './index.ts';

// Used only by event-driven browser helpers, never as shared mutable SSR state.
export const t = translator(() =>
  typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'de'
);
