import type { RentalUnit } from '@booking/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError, UnitHasReservationsError } from '../../errors/AppError';
import type {
  ListRentalUnitsResult,
  RentalUnitsRepository,
  SoftDeleteOutcome,
} from './rentalUnits.repository';
import { createRentalUnitsService, type TransactionRunner } from './rentalUnits.service';

/**
 * Service rules against a mocked repository — no database.
 *
 * The split is deliberate. What is tested here is the part that is a *decision*: which
 * failure becomes which error, and that a deleted unit is indistinguishable from one that
 * never existed. Whether the SQL actually filters `status = 'active'` is not a decision but
 * a fact about a query, and asserting it against a mock would only prove the mock agrees
 * with itself — that claim is made in the integration tests, against real Postgres.
 */

const UNIT_ID = '11111111-1111-4111-8111-111111111111';

function makeUnit(overrides: Partial<RentalUnit> = {}): RentalUnit {
  return {
    id: UNIT_ID,
    name: 'Seaside Flat',
    timezone: 'Europe/Stockholm',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * A `softDelete` stub with the outcome pinned.
 *
 * The explicit `SoftDeleteOutcome` annotation is load-bearing: without it TypeScript
 * widens `outcome: 'not_found'` to `string` and the stub stops matching the discriminated
 * union, which is the same widening that would let a typo'd outcome through unnoticed.
 */
function softDeleting(outcome: SoftDeleteOutcome) {
  return vi.fn(async (): Promise<SoftDeleteOutcome> => outcome);
}

/** A transaction runner that just runs the callback — see the note on `TransactionRunner`. */
const immediateTransaction: TransactionRunner = (fn) => fn({ query: vi.fn() } as never);

function makeRepo(overrides: Partial<RentalUnitsRepository> = {}): RentalUnitsRepository {
  return {
    insert: vi.fn(async (unit) => makeUnit({ id: unit.id, name: unit.name })),
    findById: vi.fn(async () => null),
    list: vi.fn(async (): Promise<ListRentalUnitsResult> => ({ rows: [], total: 0 })),
    update: vi.fn(async () => null),
    softDelete: vi.fn(async (): Promise<SoftDeleteOutcome> => ({ outcome: 'not_found' })),
    countBlockingReservations: vi.fn(async () => 0),
    ...overrides,
  };
}

describe('rentalUnitsService.create', () => {
  it('generates the id rather than expecting one from the caller', async () => {
    const repo = makeRepo();
    const service = createRentalUnitsService(repo, immediateTransaction);

    await service.create({ name: 'Seaside Flat', timezone: 'Europe/Stockholm' });

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
        name: 'Seaside Flat',
        timezone: 'Europe/Stockholm',
      }),
    );
  });

  it('passes the optional address straight through', async () => {
    const repo = makeRepo();
    const service = createRentalUnitsService(repo, immediateTransaction);

    await service.create({
      name: 'Seaside Flat',
      timezone: 'Europe/Stockholm',
      address: { city: 'Malmö' },
    });

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ address: { city: 'Malmö' } }),
    );
  });
});

describe('rentalUnitsService.getById — soft-delete visibility', () => {
  it('returns the unit when the repository finds one', async () => {
    const unit = makeUnit();
    const repo = makeRepo({ findById: vi.fn(async () => unit) });
    const service = createRentalUnitsService(repo, immediateTransaction);

    await expect(service.getById(UNIT_ID)).resolves.toEqual(unit);
  });

  /**
   * The repository filters deleted rows out in SQL, so "soft-deleted" reaches the service
   * as `null` — the same value a nonexistent id produces. This test pins the consequence:
   * there is no branch here that could ever tell the two apart, which is what §3.6
   * requires.
   */
  it('throws NOT_FOUND when the repository reports nothing, deleted or absent alike', async () => {
    const repo = makeRepo({ findById: vi.fn(async () => null) });
    const service = createRentalUnitsService(repo, immediateTransaction);

    await expect(service.getById(UNIT_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getById(UNIT_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });
});

describe('rentalUnitsService.list', () => {
  it('wraps rows in the §3.5 envelope and derives totalPages', async () => {
    const repo = makeRepo({
      list: vi.fn(async () => ({ rows: [makeUnit()], total: 57 })),
    });
    const service = createRentalUnitsService(repo, immediateTransaction);

    const result = await service.list({ page: 2, limit: 20 });

    expect(result.pagination).toEqual({ page: 2, limit: 20, total: 57, totalPages: 3 });
    expect(repo.list).toHaveBeenCalledWith({ page: 2, limit: 20 });
  });

  it('reports 0 pages for an empty list rather than 1', async () => {
    const service = createRentalUnitsService(makeRepo(), immediateTransaction);

    const result = await service.list({ page: 1, limit: 20 });

    expect(result).toEqual({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });
});

describe('rentalUnitsService.update', () => {
  it('returns the updated unit', async () => {
    const updated = makeUnit({ name: 'Renamed' });
    const repo = makeRepo({ update: vi.fn(async () => updated) });
    const service = createRentalUnitsService(repo, immediateTransaction);

    await expect(service.update(UNIT_ID, { name: 'Renamed' })).resolves.toEqual(updated);
  });

  /** Same invisibility rule as reads: a deleted unit cannot be patched back into life. */
  it('throws NOT_FOUND when the unit is missing or soft-deleted', async () => {
    const repo = makeRepo({ update: vi.fn(async () => null) });
    const service = createRentalUnitsService(repo, immediateTransaction);

    await expect(service.update(UNIT_ID, { name: 'Renamed' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  /** `timezone` is an ordinary editable field (§3.7), not frozen at creation. */
  it('forwards a timezone change like any other field', async () => {
    const repo = makeRepo({ update: vi.fn(async () => makeUnit({ timezone: 'Pacific/Auckland' })) });
    const service = createRentalUnitsService(repo, immediateTransaction);

    await service.update(UNIT_ID, { timezone: 'Pacific/Auckland' });

    expect(repo.update).toHaveBeenCalledWith(UNIT_ID, { timezone: 'Pacific/Auckland' });
  });
});

describe('rentalUnitsService.remove — the delete guard', () => {
  let runInTransaction: TransactionRunner;
  let transactionCalls: number;

  beforeEach(() => {
    transactionCalls = 0;
    runInTransaction = (fn) => {
      transactionCalls += 1;
      return immediateTransaction(fn);
    };
  });

  it('resolves when the unit has no non-cancelled reservations', async () => {
    const repo = makeRepo({
      softDelete: softDeleting({ outcome: 'deleted', unit: makeUnit({ status: 'deleted' }) }),
    });
    const service = createRentalUnitsService(repo, runInTransaction);

    await expect(service.remove(UNIT_ID)).resolves.toBeUndefined();
  });

  /** The 409 of §3.4 — the request is fine, the resource's state refuses. */
  it('throws UNIT_HAS_RESERVATIONS (409) when reservations block the delete', async () => {
    const repo = makeRepo({
      softDelete: softDeleting({ outcome: 'has_reservations', blockingCount: 2 }),
    });
    const service = createRentalUnitsService(repo, runInTransaction);

    await expect(service.remove(UNIT_ID)).rejects.toBeInstanceOf(UnitHasReservationsError);
    await expect(service.remove(UNIT_ID)).rejects.toMatchObject({
      code: 'UNIT_HAS_RESERVATIONS',
      status: 409,
      message: expect.stringContaining('2'),
    });
  });

  it('throws NOT_FOUND for a nonexistent unit', async () => {
    const repo = makeRepo({ softDelete: softDeleting({ outcome: 'not_found' }) });
    const service = createRentalUnitsService(repo, runInTransaction);

    await expect(service.remove(UNIT_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  /**
   * Idempotency (§3.6). The repository reports an already-deleted unit as `not_found`, and
   * the point of this test is that the service has no way to un-collapse that: the second
   * DELETE is byte-identical to deleting an id that never existed, so a client retrying a
   * timed-out request learns nothing it could act on wrongly.
   */
  it('answers a repeat delete exactly as it answers an unknown id', async () => {
    const alreadyDeleted = createRentalUnitsService(
      makeRepo({ softDelete: softDeleting({ outcome: 'not_found' }) }),
      runInTransaction,
    );
    const neverExisted = createRentalUnitsService(
      makeRepo({ softDelete: softDeleting({ outcome: 'not_found' }) }),
      runInTransaction,
    );

    const first = await alreadyDeleted.remove(UNIT_ID).catch((err: unknown) => err);
    const second = await neverExisted
      .remove('22222222-2222-4222-8222-222222222222')
      .catch((err: unknown) => err);

    expect(first).toBeInstanceOf(NotFoundError);
    expect(second).toBeInstanceOf(NotFoundError);
    expect((first as NotFoundError).code).toBe((second as NotFoundError).code);
    expect((first as NotFoundError).message).toBe((second as NotFoundError).message);
  });

  /**
   * The guard is worth nothing outside a transaction: its `FOR UPDATE` lock is released as
   * soon as the statement returns if there is no surrounding transaction to hold it. So
   * "the check ran inside one" is part of the rule, not an implementation detail.
   */
  it('runs the guard inside a transaction', async () => {
    const repo = makeRepo({
      softDelete: softDeleting({ outcome: 'deleted', unit: makeUnit() }),
    });
    const service = createRentalUnitsService(repo, runInTransaction);

    await service.remove(UNIT_ID);

    expect(transactionCalls).toBe(1);
    expect(repo.softDelete).toHaveBeenCalledTimes(1);
  });
});
