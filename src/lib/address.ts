import type { Person } from './model.ts';

type Address = Pick<Person, 'street' | 'houseNumber' | 'postalCode' | 'location'>;

export function addressLines(person: Address): string[] {
  return [
    [person.street, person.houseNumber]
      .filter((part) => part?.trim())
      .join(' ')
      .trim(),
    [person.postalCode, person.location]
      .filter((part) => part?.trim())
      .join(' ')
      .trim()
  ].filter(Boolean);
}

export function googleMapsUrl(person: Address): string | undefined {
  const query = addressLines(person).join(', ');
  if (!query) return undefined;
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.href;
}
