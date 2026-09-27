import type { DB } from './db.js';
import type { Settings } from '../shared/types.js';
import { checkDuration, checkName, checkPhone, checkTemplate, tidy } from '../shared/validation.js';
import { need, UserError } from './errors.js';

interface SettingsRow {
  business_name: string;
  owner_name: string;
  business_phone: string | null;
  default_duration_minutes: number;
  reminder_template: string;
  on_my_way_template: string;
  updated_at: string;
}

export function getSettings(db: DB): Settings {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as SettingsRow;
  return {
    businessName: row.business_name,
    ownerName: row.owner_name,
    businessPhone: row.business_phone,
    defaultDurationMinutes: row.default_duration_minutes,
    reminderTemplate: row.reminder_template,
    onMyWayTemplate: row.on_my_way_template,
    updatedAt: row.updated_at,
  };
}

/**
 * Update business details. Only the settings row changes; clients,
 * appointments and payment history are never touched, so the business can
 * be handed to a new owner safely.
 */
export function updateSettings(db: DB, input: Record<string, unknown>): Settings {
  const businessName = need(checkName(input.businessName, 'business name'), 'businessName');
  const ownerName = tidy(input.ownerName);
  if (ownerName.length > 100) throw new UserError('That owner name is too long. Please shorten it.', 400, 'ownerName');
  const businessPhone = need(checkPhone(input.businessPhone), 'businessPhone');
  const defaultDurationMinutes = need(checkDuration(input.defaultDurationMinutes), 'defaultDurationMinutes');
  const reminderTemplate = need(checkTemplate(input.reminderTemplate, 'reminder message'), 'reminderTemplate');
  const onMyWayTemplate = need(checkTemplate(input.onMyWayTemplate, '"On my way" message'), 'onMyWayTemplate');

  db.prepare(
    `UPDATE settings SET business_name = ?, owner_name = ?, business_phone = ?, default_duration_minutes = ?,
       reminder_template = ?, on_my_way_template = ?, updated_at = ? WHERE id = 1`,
  ).run(
    businessName,
    ownerName,
    businessPhone,
    defaultDurationMinutes,
    reminderTemplate,
    onMyWayTemplate,
    new Date().toISOString(),
  );
  return getSettings(db);
}
