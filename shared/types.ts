/** Shapes sent between the server and the browser. */
import type { Repeat, RepeatFrequency } from './recurrence.js';

export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'canceled'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const PAYMENT_STATUSES = ['unpaid', 'paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  canceled: 'Canceled',
};

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
};

export interface Settings {
  businessName: string;
  ownerName: string;
  businessPhone: string | null;
  defaultDurationMinutes: number;
  reminderTemplate: string;
  onMyWayTemplate: string;
  updatedAt: string;
}

export interface Client {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  defaultPriceCents: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesInfo {
  id: number;
  frequency: RepeatFrequency;
  startDate: string;
  endsOn: string | null;
}

export interface Appointment {
  id: number;
  clientId: number;
  seriesId: number | null;
  date: string;
  time: string;
  durationMinutes: number;
  priceCents: number | null;
  notes: string | null;
  status: AppointmentStatus;
  paymentStatus: PaymentStatus;
  completedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Client details come from the client record (never copied). */
  client: Pick<Client, 'id' | 'name' | 'phone' | 'address' | 'archivedAt'>;
  series: SeriesInfo | null;
}

export interface ConflictInfo {
  /** The date/time that was being booked when the conflict was found. */
  requestedDate: string;
  requestedTime: string;
  appointment: Appointment;
}

export interface NewAppointmentInput {
  clientId?: number | null;
  clientName: string;
  date: string;
  time: string;
  address?: string;
  phone?: string;
  price?: string;
  notes?: string;
  repeat?: Repeat;
  /** Random id per form submission; protects against double submits. */
  requestId?: string;
  /** Set after the user saw the conflict warning and chose to book anyway. */
  allowConflict?: boolean;
}

export interface CreateAppointmentResult {
  appointment: Appointment;
  client: Client;
  createdCount: number;
  clientCreated: boolean;
  duplicate: boolean;
}

export interface UpdateAppointmentInput {
  date: string;
  time: string;
  durationMinutes?: number;
  price?: string;
  notes?: string;
  /** For repeating cleanings: change only this one, or this and all later ones. */
  scope?: 'one' | 'future';
  allowConflict?: boolean;
}

export interface ClientInput {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  defaultPrice?: string;
}

export interface ClientWithAppointments extends Client {
  appointments: Appointment[];
}

export interface ApiErrorBody {
  error: string;
  field?: string;
  conflict?: ConflictInfo;
  code?: string;
}
