import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { emptyDatabase, type Person, type Reminder } from '../src/lib/model.ts';

export async function temporaryDirectory(t: TestContext): Promise<string> {
  const prefix = join(tmpdir(), 'nahbei-test-');
  const directory = await mkdtemp(prefix);
  t.after(async () => {
    if (!resolve(directory).startsWith(resolve(prefix))) throw new Error('Unsafe cleanup path');
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}
export function person(id = 'lea'): Person {
  return {
    id,
    name: id === 'lea' ? 'Lea Müller' : 'Jonas Weber',
    context: 'Freundeskreis',
    email: '',
    phone: '',
    location: 'Hamburg',
    tags: ['Freunde'],
    notes: 'Mag Kaffee.',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z'
  };
}
export function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'follow-up',
    personIds: ['lea'],
    title: 'Nach dem Gespräch fragen',
    date: '2026-10-24',
    recurrence: 'once',
    state: 'active',
    completed: [],
    createdAt: '2026-01-01T10:00:00.000Z',
    ...overrides
  };
}
export function fixture() {
  const db = emptyDatabase();
  db.people = [person(), person('jonas')];
  db.reminders = [reminder()];
  db.relationships = [
    { id: 'relation', fromId: 'lea', toId: 'jonas', label: 'ist befreundet mit' }
  ];
  return db;
}
