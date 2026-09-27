import { detectPlatform } from '../shared/links';

export const platform = typeof navigator === 'undefined' ? 'other' : detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
