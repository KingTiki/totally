import type { Database, Person, Reminder } from './model.ts';

export const isActivePerson = (person: Person): boolean => person.deletedAt === undefined;

export function activePerson(db: Database, id: string): Person | undefined {
  return db.people.find((person) => person.id === id && isActivePerson(person));
}

// Reminders keep their stored state and resume automatically after restoration.
export function availableReminder(db: Database, reminder: Reminder): boolean {
  return reminder.personIds.every((id) => activePerson(db, id));
}

// Only use this projection for views. Writes and backups always use the full database.
export function activeDatabase(db: Database): Database {
  const people = db.people.filter(isActivePerson);
  const ids = new Set(people.map((person) => person.id));
  return {
    ...db,
    people,
    topics: db.topics.filter((topic) => ids.has(topic.personId)),
    entries: db.entries.filter((entry) => entry.personIds.some((id) => ids.has(id))),
    relationships: db.relationships.filter((r) => ids.has(r.fromId) && ids.has(r.toId)),
    reminders: db.reminders.filter((reminder) => reminder.personIds.every((id) => ids.has(id)))
  };
}
