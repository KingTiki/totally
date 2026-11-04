export type Birthday = { month: number; day: number; year?: number };
export type Person = {
  id: string;
  name: string;
  context: string;
  email: string;
  phone: string;
  location: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  tags: string[];
  notes: string;
  photo?: string;
  photoId?: string;
  birthday?: Birthday;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};
export type Entry = {
  id: string;
  personIds: string[];
  kind: 'note' | 'contact';
  contactType: string;
  text: string;
  date: string;
  createdAt: string;
  updatedAt?: string;
  topicId?: string;
};
export type Topic = {
  id: string;
  personId: string;
  title: string;
  description: string;
  state: 'active' | 'done';
  createdAt: string;
  updatedAt: string;
};
export type Relationship = { id: string; fromId: string; toId: string; label: string };
export type Reminder = {
  id: string;
  personIds: string[];
  title: string;
  date: string;
  recurrence: 'once' | 'annual' | 'interval';
  intervalDays?: number;
  state: 'active' | 'paused' | 'done';
  completed: string[];
  snooze?: { occurrence: string; date: string };
  createdAt: string;
};
export type Settings = { timezone: string; digestTime: string; emailEnabled: boolean };
export type Delivery = {
  id: string;
  date: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  subject: string;
  text: string;
  error?: string;
};
export type Database = {
  schemaVersion: 1;
  people: Person[];
  entries: Entry[];
  topics: Topic[];
  relationships: Relationship[];
  reminders: Reminder[];
  deliveries: Delivery[];
  settings: Settings;
};
export type AgendaItem = {
  key: string;
  id: string;
  kind: 'birthday' | 'reminder';
  title: string;
  date: string;
  occurrence: string;
  personIds: string[];
  detail: string;
};
export function emptyDatabase(): Database {
  return {
    schemaVersion: 1,
    people: [],
    entries: [],
    topics: [],
    relationships: [],
    reminders: [],
    deliveries: [],
    settings: { timezone: 'Europe/Berlin', digestTime: '09:00', emailEnabled: false }
  };
}
