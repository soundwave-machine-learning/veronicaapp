import { describe, expect, it } from 'vitest';
import {
  appointmentTemplateValues,
  DEFAULT_ON_MY_WAY_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE,
  fillTemplate,
} from '../../shared/templates';

const values = appointmentTemplateValues({
  clientName: 'Maria Johnson',
  date: '2026-09-29',
  time: '10:00',
  businessName: 'Sparkle Home Cleaning',
});

describe('message templates', () => {
  it('fills the default reminder', () => {
    expect(fillTemplate(DEFAULT_REMINDER_TEMPLATE, values)).toBe(
      'Hi Maria, this is a reminder that your cleaning with Sparkle Home Cleaning is scheduled for Tuesday, September 29 at 10:00 AM. Thank you!',
    );
  });

  it('fills the default On My Way message', () => {
    expect(fillTemplate(DEFAULT_ON_MY_WAY_TEMPLATE, values)).toBe(
      "Hi Maria, I'm on my way for your cleaning. See you soon!",
    );
  });

  it('replaces repeated, spaced and differently-cased variables', () => {
    expect(fillTemplate('{client} {CLIENT} { client } {Business}', values)).toBe('Maria Maria Maria Sparkle Home Cleaning');
  });

  it('leaves unknown placeholders alone', () => {
    expect(fillTemplate('Hi {client}, {unknown}', values)).toBe('Hi Maria, {unknown}');
  });
});
