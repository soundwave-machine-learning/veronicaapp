/** Client name matching and searching. */

/**
 * Key used to recognise the same person typed slightly differently:
 * "maria  johnson", "Maria Johnson" and "María Johnson." are all the same.
 */
export function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SearchableClient {
  name: string;
  phone?: string | null;
  address?: string | null;
}

/**
 * Rank clients for a search box. Lower score = better. Returns null when the
 * client does not match at all.
 */
export function clientMatchScore(query: string, client: SearchableClient): number | null {
  const q = nameKey(query);
  if (!q) return 0;
  const name = nameKey(client.name);
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.split(' ').some((word) => word.startsWith(q))) return 2;
  if (name.includes(q)) return 3;
  const queryDigits = query.replace(/\D/g, '');
  if (queryDigits.length >= 3 && client.phone && client.phone.replace(/\D/g, '').includes(queryDigits)) return 4;
  if (client.address && nameKey(client.address).includes(q)) return 5;
  return null;
}

export function searchClients<T extends SearchableClient>(query: string, clients: T[], limit = Infinity): T[] {
  return clients
    .map((client) => ({ client, score: clientMatchScore(query, client) }))
    .filter((entry): entry is { client: T; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.client.name.localeCompare(b.client.name))
    .slice(0, limit)
    .map((entry) => entry.client);
}
