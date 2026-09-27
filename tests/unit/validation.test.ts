import { describe, expect, it } from 'vitest';
import { checkDate, checkName, checkPhone, checkPrice, checkTime, formatPrice, checkAddress } from '../../shared/validation';

describe('validation', () => {
  it('requires a name and tidies spaces', () => {
    expect(checkName('  Maria   Johnson ')).toEqual({ ok: true, value: 'Maria Johnson' });
    expect(checkName('   ').ok).toBe(false);
    expect(checkName('x'.repeat(101)).ok).toBe(false);
  });

  it('checks dates and times', () => {
    expect(checkDate('2026-09-29').ok).toBe(true);
    expect(checkDate('2026-02-31').ok).toBe(false);
    expect(checkDate('').ok).toBe(false);
    expect(checkTime('10:00').ok).toBe(true);
    expect(checkTime('25:00').ok).toBe(false);
  });

  it('formats and rejects phone numbers', () => {
    expect(checkPhone('555-123-4567')).toEqual({ ok: true, value: '(555) 123-4567' });
    expect(checkPhone('1 (555) 123 4567')).toEqual({ ok: true, value: '(555) 123-4567' });
    expect(checkPhone('+44 20 7946 0958')).toEqual({ ok: true, value: '+442079460958' });
    expect(checkPhone('')).toEqual({ ok: true, value: null });
    expect(checkPhone('12345').ok).toBe(false);
    expect(checkPhone('call me').ok).toBe(false);
  });

  it('reads prices in dollars and stores cents', () => {
    expect(checkPrice('120')).toEqual({ ok: true, value: 12000 });
    expect(checkPrice('$120.50')).toEqual({ ok: true, value: 12050 });
    expect(checkPrice('1,200')).toEqual({ ok: true, value: 120000 });
    expect(checkPrice('')).toEqual({ ok: true, value: null });
    expect(checkPrice('-5').ok).toBe(false);
    expect(checkPrice('abc').ok).toBe(false);
    expect(checkPrice('12.345').ok).toBe(false);
    expect(formatPrice(12000)).toBe('$120');
    expect(formatPrice(12050)).toBe('$120.50');
  });

  it('treats blank addresses as empty', () => {
    expect(checkAddress('   ')).toEqual({ ok: true, value: null });
    expect(checkAddress(' 123  Main Street ')).toEqual({ ok: true, value: '123 Main Street' });
  });
});
