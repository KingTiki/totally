import type { Database } from './model.ts';
import { translator, type Language } from './i18n/index.ts';

export function contactRhythms(db: Database, personId: string) {
  return db.reminders
    .filter(
      (reminder) =>
        reminder.recurrence === 'interval' &&
        reminder.state !== 'done' &&
        reminder.personIds.includes(personId)
    )
    .sort(
      (a, b) =>
        Number(a.state === 'paused') - Number(b.state === 'paused') ||
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id)
    );
}

export function rhythmLabel(days: number, language: Language = 'de'): string {
  const t = translator(language);
  if (days === 1) return t('Jeden Tag');
  if (days === 7) return t('Jede Woche');
  if (days % 7 === 0) return t('Alle {p0} Wochen', { p0: days / 7 });
  return t('Alle {p0} Tage', { p0: days });
}
