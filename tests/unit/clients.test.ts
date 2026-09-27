import { describe, expect, it } from 'vitest';
import { nameKey, searchClients } from '../../shared/clients';

const clients = [
  { name: 'Maria Johnson', phone: '(555) 123-4567', address: '123 Main Street' },
  { name: 'Maria Lopez', phone: null, address: '456 Oak Avenue' },
  { name: 'Anna Mariano', phone: null, address: null },
  { name: 'Robert Davis', phone: '(555) 987-6543', address: '789 Pine Road' },
];

describe('client matching', () => {
  it('treats small differences in a name as the same person', () => {
    expect(nameKey('  maria   JOHNSON ')).toBe(nameKey('Maria Johnson'));
    expect(nameKey('María Johnson.')).toBe(nameKey('Maria Johnson'));
    expect(nameKey('Maria Johnson')).not.toBe(nameKey('Maria Johnston'));
  });

  it('suggests names that start with what was typed first', () => {
    expect(searchClients('Mar', clients).map((c) => c.name)).toEqual(['Maria Johnson', 'Maria Lopez', 'Anna Mariano']);
    expect(searchClients('lop', clients).map((c) => c.name)).toEqual(['Maria Lopez']);
  });

  it('searches phone numbers and addresses', () => {
    expect(searchClients('987', clients).map((c) => c.name)).toEqual(['Robert Davis']);
    expect(searchClients('oak ave', clients).map((c) => c.name)).toEqual(['Maria Lopez']);
    expect(searchClients('nobody', clients)).toEqual([]);
  });
});
