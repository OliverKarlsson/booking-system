import { randomUUID } from 'node:crypto';

import type {
  CreateRentalUnitInput,
  Paginated,
  PaginationQuery,
  RentalUnit,
  UpdateRentalUnitInput,
} from '@booking/shared';

import { withTransaction, type Queryable } from '../../db/pool';
import { NotFoundError, UnitHasReservationsError } from '../../errors/AppError';
import {
  rentalUnitsRepository,
  type RentalUnitsRepository,
} from './rentalUnits.repository';

/**
 * Business rules for rental units. No SQL, no Express.
 *
 * The layer earns its place on exactly one endpoint — `DELETE`, where "may this unit be
 * removed?" is a policy question with three distinct answers. The other four are thin, and
 * that is fine: a uniform shape means the delete rule sits where a reader would look for
 * it, rather than being the one piece of logic hiding in a route handler.
 */

/**
 * Runs `fn` with a transaction-scoped client.
 *
 * Injected rather than imported so the service's rules can be unit-tested against a mock
 * repository with no database in reach. The production default is the real
 * `withTransaction`; a test passes `(fn) => fn(fakeDb)`. Faking the transaction is honest
 * here because what the unit tests assert is the *mapping* from outcome to error — that
 * the lock and the rollback work is an integration-level claim, and is tested as one.
 */
export type TransactionRunner = <T>(fn: (db: Queryable) => Promise<T>) => Promise<T>;

export interface RentalUnitsService {
  create(input: CreateRentalUnitInput): Promise<RentalUnit>;
  getById(id: string): Promise<RentalUnit>;
  list(query: PaginationQuery): Promise<Paginated<RentalUnit>>;
  update(id: string, patch: UpdateRentalUnitInput): Promise<RentalUnit>;
  remove(id: string): Promise<void>;
}

export function createRentalUnitsService(
  repo: RentalUnitsRepository = rentalUnitsRepository,
  runInTransaction: TransactionRunner = withTransaction,
): RentalUnitsService {
  return {
    /**
     * The id is generated here, by the application, not by a database default.
     *
     * That is the §2 decision (`crypto.randomUUID()`), and it buys more than symmetry: the
     * caller knows the id before the INSERT, so a write that times out can be retried or
     * traced without a second round trip to find out what it was called.
     */
    async create(input) {
      return repo.insert({
        id: randomUUID(),
        name: input.name,
        timezone: input.timezone,
        address: input.address,
      });
    },

    /**
     * A soft-deleted unit is a 404, identical to one that never existed (§3.6).
     *
     * The repository's read predicates are what make that true; this method never sees a
     * deleted row to decide about. Leaking the distinction would be a small information
     * disclosure and, worse, would invite a client to build on a "deleted" state the
     * contract does not have.
     */
    async getById(id) {
      const unit = await repo.findById(id);
      if (!unit) throw new NotFoundError('Rental unit not found');

      return unit;
    },

    async list(query) {
      const { rows, total } = await repo.list({ page: query.page, limit: query.limit });

      return {
        data: rows,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          // `Math.ceil` on an empty list gives 0, not 1 — "0 pages" is the honest answer
          // for no results, and the contract's `totalPages` has a minimum of 0.
          totalPages: Math.ceil(total / query.limit),
        },
      };
    },

    /**
     * `updateRentalUnitSchema` has already rejected an empty patch with a 400 before this
     * runs, so there is no no-op case to handle. `timezone` is patchable like any other
     * field (§3.7): reservation dates are calendar dates, so changing the zone
     * reinterprets no stored row — it only moves the dashboard's derived `localDate`.
     */
    async update(id, patch) {
      const unit = await repo.update(id, patch);
      if (!unit) throw new NotFoundError('Rental unit not found');

      return unit;
    },

    /**
     * Soft delete. The whole rule of §3.6 is these five lines.
     *
     * Three outcomes, and which error each becomes is the decision worth isolating:
     *
     *  - `not_found` covers both "no such unit" and "already deleted". Collapsing them is
     *    the idempotency requirement, not a shortcut — DELETE must be safe to retry, and a
     *    client that cannot distinguish its own second call from a wrong id is exactly the
     *    property that makes it safe.
     *  - `has_reservations` is a 409 rather than a 400: the request is well-formed and the
     *    unit exists, so nothing about the message could be corrected. It is the state of
     *    the resource that refuses, which is what 409 means.
     *  - `deleted` returns nothing. The route answers 204; the updated row is not echoed
     *    back because a deleted unit is not a resource the client should keep.
     */
    async remove(id) {
      const result = await runInTransaction((db) => repo.softDelete(id, db));

      if (result.outcome === 'not_found') {
        throw new NotFoundError('Rental unit not found');
      }

      if (result.outcome === 'has_reservations') {
        throw new UnitHasReservationsError(
          `Cannot delete a rental unit with ${result.blockingCount} non-cancelled reservation(s)`,
        );
      }
    },
  };
}

export const rentalUnitsService = createRentalUnitsService();
