import type { ConflictInfo } from '../shared/types.js';

/** An error whose message is safe and friendly enough to show the user. */
export class UserError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly field?: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export class NotFoundError extends UserError {
  constructor(message = 'We could not find that. It may have been removed.') {
    super(message, 404, undefined, 'not_found');
  }
}

export class ConflictError extends UserError {
  constructor(public readonly conflict: ConflictInfo) {
    super('You already have a cleaning scheduled around this time.', 409, 'time', 'conflict');
  }
}

/** Unwrap a validation result or throw a friendly error for that field. */
export function need<T>(result: { ok: true; value: T } | { ok: false; error: string }, field: string): T {
  if (!result.ok) throw new UserError(result.error, 400, field, 'invalid');
  return result.value;
}
