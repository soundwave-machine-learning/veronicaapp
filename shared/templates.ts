/** Prepared text messages. */
import { formatDateFriendly, formatTime } from './dates.js';

export const DEFAULT_REMINDER_TEMPLATE =
  'Hi {client}, this is a reminder that your cleaning with {business} is scheduled for {date} at {time}. Thank you!';

export const DEFAULT_ON_MY_WAY_TEMPLATE = "Hi {client}, I'm on my way for your cleaning. See you soon!";

export const TEMPLATE_VARIABLES = ['{client}', '{date}', '{time}', '{business}'] as const;

export interface TemplateValues {
  client: string;
  date: string;
  time: string;
  business: string;
}

/**
 * Replace {client}, {date}, {time} and {business}. Matching ignores case and
 * spaces inside the braces ("{ Client }" works too). Unknown placeholders are
 * left untouched so the user can see them.
 */
export function fillTemplate(template: string, values: TemplateValues): string {
  return template.replace(/\{\s*(client|date|time|business)\s*\}/gi, (_match, key: string) => {
    return values[key.toLowerCase() as keyof TemplateValues] ?? '';
  });
}

/** Build values for an appointment. Uses the client's first name for a friendly tone. */
export function appointmentTemplateValues(input: {
  clientName: string;
  date: string;
  time: string;
  businessName: string;
}): TemplateValues {
  return {
    client: firstName(input.clientName),
    date: formatDateFriendly(input.date),
    time: formatTime(input.time),
    business: input.businessName.trim() || 'us',
  };
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}
