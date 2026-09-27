/**
 * Links that hand off to the phone's own apps. Veronica never sends texts
 * or places calls itself: it opens the phone's dialer, messaging app or
 * maps app with everything filled in, and the user presses Send/Call.
 */

export type Platform = 'ios' | 'other';

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPadOS reports itself as a Mac but has a touch screen.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return 'other';
}

/** Number in the form phones understand best: +15551234567. */
export function phoneForLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}

export function telHref(phone: string | null | undefined): string | null {
  const number = phoneForLink(phone);
  return number ? `tel:${number}` : null;
}

/**
 * sms: link with a prepared message. iPhones expect "&body=", Android and
 * most other devices expect "?body=".
 */
export function smsHref(phone: string | null | undefined, body: string, platform: Platform): string | null {
  const number = phoneForLink(phone);
  if (!number) return null;
  const separator = platform === 'ios' ? '&' : '?';
  return `sms:${number}${separator}body=${encodeURIComponent(body)}`;
}

/**
 * Directions to an address. iPhones open Apple Maps; everything else opens
 * Google Maps (the app on Android, the website on a computer). Neither needs
 * an API key.
 */
export function mapsHref(address: string | null | undefined, platform: Platform): string | null {
  const destination = address?.trim();
  if (!destination) return null;
  const encoded = encodeURIComponent(destination);
  if (platform === 'ios') return `https://maps.apple.com/?daddr=${encoded}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}
