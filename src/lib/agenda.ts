import type { AgendaItem, Database, Person } from './model.ts';
import { addDays, annualDate, birthdayLabel, localClock } from './dates.ts';
import { activeDatabase, isActivePerson } from './people.ts';
import { translator, type Language } from './i18n/index.ts';

export function lastContact(db: Database, personId: string): string | undefined {
  return db.entries
    .filter((e) => e.kind === 'contact' && e.personIds.includes(personId))
    .map((e) => e.date)
    .sort()
    .at(-1);
}
export function agenda(
  db: Database,
  from: string,
  to: string,
  includeOverdue = false,
  language: Language = 'de'
): AgendaItem[] {
  const t = translator(language);
  db = activeDatabase(db);
  const items: AgendaItem[] = [];
  const startYear = Number(from.slice(0, 4)),
    endYear = Number(to.slice(0, 4));
  for (const person of db.people) {
    if (!person.birthday) continue;
    for (let year = startYear; year <= endYear; year++) {
      if (person.birthday.year !== undefined && year < person.birthday.year) continue;
      const date = annualDate(person.birthday.month, person.birthday.day, year);
      if (date >= from && date <= to)
        items.push({
          key: `birthday:${person.id}:${date}`,
          id: person.id,
          kind: 'birthday',
          title: t('{p0} hat Geburtstag', { p0: person.name }),
          date,
          occurrence: date,
          personIds: [person.id],
          detail: birthdayLabel(person.birthday, year, language)
        });
    }
  }
  for (const reminder of db.reminders) {
    if (reminder.state !== 'active') continue;
    const dates =
      reminder.recurrence === 'annual'
        ? Array.from({ length: endYear - startYear + 1 }, (_, i) =>
            annualDate(
              Number(reminder.date.slice(5, 7)),
              Number(reminder.date.slice(8)),
              startYear + i
            )
          )
        : [reminder.date];
    if (includeOverdue && reminder.recurrence === 'annual') {
      dates.push(
        annualDate(Number(reminder.date.slice(5, 7)), Number(reminder.date.slice(8)), startYear - 1)
      );
    }
    const latestPast = dates
      .filter((date) => date >= reminder.date && date <= from)
      .sort()
      .at(-1);
    // A snoozed December occurrence can still be pending in January.
    if (reminder.snooze) dates.push(reminder.snooze.occurrence);
    for (const occurrence of new Set(dates)) {
      if (occurrence < reminder.date || reminder.completed.includes(occurrence)) continue;
      if (
        reminder.recurrence === 'annual' &&
        occurrence < from &&
        occurrence !== latestPast &&
        occurrence !== reminder.snooze?.occurrence
      )
        continue;
      const date = reminder.snooze?.occurrence === occurrence ? reminder.snooze.date : occurrence;
      if (date > to || (!includeOverdue && date < from)) continue;
      items.push({
        key: `${reminder.id}:${occurrence}`,
        id: reminder.id,
        kind: 'reminder',
        title: reminder.title,
        date,
        occurrence,
        personIds: reminder.personIds,
        detail:
          reminder.recurrence === 'interval'
            ? reminder.intervalDays === 1
              ? t('Jeden Tag')
              : t('Alle {p0} Tage', { p0: reminder.intervalDays! })
            : reminder.recurrence === 'annual'
              ? t('Jährlich')
              : t('Wiedervorlage')
      });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'de'));
}
export function upcoming(db: Database, now = new Date(), language: Language = 'de'): AgendaItem[] {
  const today = localClock(now, db.settings.timezone).date;
  return agenda(db, today, addDays(today, 60), true, language);
}
export function namesFor(db: Database, ids: string[]): Person[] {
  return db.people.filter((p) => isActivePerson(p) && ids.includes(p.id));
}
