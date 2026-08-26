import {
  ERROR_STATUS,
  type ErrorCode,
  type ReservationSummary,
  type ValidationIssue,
} from '@booking/shared';

/**
 * One class per code in the error contract (§3.4).
 *
 * Modelling these as classes rather than throwing ad-hoc objects means the machine code
 * travels *with* the failure, so no call site has to remember that "unit has
 * reservations" is a 409 and not a 400. `errorHandler` is then a pure translation step
 * with no business knowledge in it.
 *
 * The HTTP status is not restated here: it is read from `ERROR_STATUS` in
 * @booking/shared, the same table the OpenAPI document and the frontend's error handling
 * use. A second copy of the code→status mapping would be free to drift from the contract
 * it claims to implement.
 */
export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;

  /** Code-specific payload; see §3.4. Serialised as `details` in the envelope. */
  readonly details?: unknown[];

  constructor(message: string, details?: unknown[]) {
    super(message);
    this.name = new.target.name;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }

  // A getter rather than a field: `this.code` is a subclass field initialiser, which
  // runs after the base constructor, so reading it eagerly in `super()` would see
  // `undefined`.
  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Thrown for validation failures Zod cannot express — a cross-field rule checked in a
 * service, for instance. Zod's own `ZodError` is mapped to the same code directly by
 * `errorHandler`, so both paths produce an identical envelope.
 */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';

  constructor(message = 'Request validation failed', issues: ValidationIssue[] = []) {
    super(message, issues);
  }
}

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';

  constructor(message = 'Resource not found') {
    super(message);
  }
}

/**
 * Distinct from NOT_FOUND so the reservation form can say "that unit no longer exists"
 * rather than leaving the user to guess which of the two ids in their request was bad.
 */
export class RentalUnitNotFoundError extends AppError {
  readonly code = 'RENTAL_UNIT_NOT_FOUND';

  constructor(message = 'Rental unit not found') {
    super(message);
  }
}

/**
 * Carries the reservations it collided with. That payload is the entire reason the write
 * path runs a (racy, non-authoritative) overlap SELECT before inserting — the exclusion
 * constraint guarantees correctness but reports only SQLSTATE 23P01, which cannot tell
 * the UI that the clash is with Jane Doe, 12–15 March.
 */
export class BookingConflictError extends AppError {
  readonly code = 'BOOKING_CONFLICT';

  constructor(
    conflicts: ReservationSummary[] = [],
    message = 'Reservation overlaps an existing booking',
  ) {
    super(message, conflicts);
  }
}

export class UnitHasReservationsError extends AppError {
  readonly code = 'UNIT_HAS_RESERVATIONS';

  constructor(message = 'Cannot delete a rental unit that has active reservations') {
    super(message);
  }
}

export class RateLimitedError extends AppError {
  readonly code = 'RATE_LIMITED';

  constructor(message = 'Too many requests, please try again later') {
    super(message);
  }
}

/**
 * Rarely thrown explicitly — `errorHandler` produces this envelope for any unrecognised
 * error. Its message is always the generic one on the wire; see errorHandler.ts for why.
 */
export class InternalError extends AppError {
  readonly code = 'INTERNAL_ERROR';

  constructor(message = 'An unexpected error occurred') {
    super(message);
  }
}
