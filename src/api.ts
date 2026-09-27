/** Talking to the Veronica server. */
import type {
  ApiErrorBody,
  Appointment,
  AppointmentStatus,
  Client,
  ClientInput,
  ClientWithAppointments,
  ConflictInfo,
  CreateAppointmentResult,
  NewAppointmentInput,
  PaymentStatus,
  Settings,
  UpdateAppointmentInput,
} from '../shared/types';

export class ApiError extends Error {
  status: number;
  field?: string;
  code?: string;
  conflict?: ConflictInfo;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.error || 'Something went wrong. Please try again.');
    this.status = status;
    this.field = body.field;
    this.code = body.code;
    this.conflict = body.conflict;
  }
}

export const UNAUTHORIZED_EVENT = 'veronica:unauthorized';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, {
      error: "We couldn't reach Veronica. Please check your internet connection and try again.",
      code: 'offline',
    });
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(response.status, (data as ApiErrorBody) ?? {});
  }
  return data as T;
}

const qs = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const api = {
  session: () => request<{ authRequired: boolean; authenticated: boolean }>('GET', '/api/session'),
  login: (password: string) => request<{ authenticated: boolean }>('POST', '/api/login', { password }),
  logout: () => request<{ authenticated: boolean }>('POST', '/api/logout', {}),

  settings: () => request<Settings>('GET', '/api/settings'),
  saveSettings: (input: Partial<Settings>) => request<Settings>('PUT', '/api/settings', input),

  clients: (search = '', archived = false) =>
    request<Client[]>('GET', `/api/clients${qs({ search, archived: archived ? 'true' : undefined })}`),
  client: (id: number) => request<ClientWithAppointments>('GET', `/api/clients/${id}`),
  createClient: (input: ClientInput) => request<Client>('POST', '/api/clients', input),
  updateClient: (id: number, input: ClientInput) => request<Client>('PUT', `/api/clients/${id}`, input),
  archiveClient: (id: number, today: string) => request<Client>('POST', `/api/clients/${id}/archive`, { today }),
  restoreClient: (id: number) => request<Client>('POST', `/api/clients/${id}/restore`, {}),

  appointments: (from: string, to: string) => request<Appointment[]>('GET', `/api/appointments${qs({ from, to })}`),
  appointment: (id: number) => request<Appointment>('GET', `/api/appointments/${id}`),
  nextAfter: (date: string) => request<{ appointment: Appointment | null }>('GET', `/api/appointments/next${qs({ after: date })}`),
  unpaid: () => request<Appointment[]>('GET', '/api/appointments/unpaid'),
  createAppointment: (input: NewAppointmentInput) => request<CreateAppointmentResult>('POST', '/api/appointments', input),
  updateAppointment: (id: number, input: UpdateAppointmentInput & { today?: string }) =>
    request<Appointment>('PUT', `/api/appointments/${id}`, input),
  setStatus: (id: number, status: AppointmentStatus, allowConflict = false) =>
    request<Appointment>('POST', `/api/appointments/${id}/status`, { status, allowConflict }),
  setPayment: (id: number, paymentStatus: PaymentStatus) =>
    request<Appointment>('POST', `/api/appointments/${id}/payment`, { paymentStatus }),
  stopRepeating: (id: number, today: string) =>
    request<{ appointment: Appointment; removed: number }>('POST', `/api/appointments/${id}/stop-repeating`, { today }),
};

/** A random id for each form submission (protects against double submits). */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
