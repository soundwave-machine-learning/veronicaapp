import { describe, expect, it } from 'vitest';
import { detectPlatform, mapsHref, smsHref, telHref } from '../../shared/links';

describe('phone and map links', () => {
  it('builds tel: links', () => {
    expect(telHref('(555) 123-4567')).toBe('tel:+15551234567');
    expect(telHref('+442079460958')).toBe('tel:+442079460958');
    expect(telHref(null)).toBeNull();
    expect(telHref('')).toBeNull();
  });

  it('builds sms: links with an encoded message for each platform', () => {
    const body = "Hi Maria, I'm on my way & see you soon!";
    expect(smsHref('(555) 123-4567', body, 'other')).toBe(
      `sms:+15551234567?body=${encodeURIComponent(body)}`,
    );
    expect(smsHref('(555) 123-4567', body, 'ios')).toBe(`sms:+15551234567&body=${encodeURIComponent(body)}`);
    expect(smsHref(null, body, 'ios')).toBeNull();
  });

  it('builds directions links with encoded addresses', () => {
    expect(mapsHref('123 Main Street, Springfield #2', 'other')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=123%20Main%20Street%2C%20Springfield%20%232',
    );
    expect(mapsHref('123 Main Street', 'ios')).toBe('https://maps.apple.com/?daddr=123%20Main%20Street');
    expect(mapsHref('   ', 'ios')).toBeNull();
  });

  it('detects iPhones and iPads', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('other');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14)')).toBe('other');
  });
});
