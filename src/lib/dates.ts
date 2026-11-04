import type { Birthday } from './model.ts';
import { translator, type Language } from './i18n/index.ts';

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= '1900-01-01' &&
    value <= '9998-12-31'
  );
}
export function addDays(value: string, days: number): string {
  const date = new Date(value + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000);
}
export function localClock(now: Date, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`
  };
}
export function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('de', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
export function annualDate(month: number, day: number, year: number): string {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return `${year}-${String(month).padStart(2, '0')}-${String(month === 2 && day === 29 && !leap ? 28 : day).padStart(2, '0')}`;
}
export function birthdayLabel(birthday: Birthday, year: number, language: Language = 'de'): string {
  const t = translator(language);
  return birthday.year === undefined
    ? t('Geburtstag')
    : t('Wird {p0}', { p0: year - birthday.year });
}
export function formatDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
): string {
  return new Intl.DateTimeFormat('de-DE', { ...options, timeZone: 'UTC' }).format(
    new Date(date + 'T12:00:00Z')
  );
}
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
