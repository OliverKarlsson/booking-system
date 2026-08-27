import { randomUUID } from 'node:crypto';

import { createRentalUnitSchema, createReservationSchema } from '@booking/shared';
import type pg from 'pg';

import { env } from '../config/env';
import { withTransaction } from '../db/pool';
import { rentalUnitsRepository } from '../modules/rentalUnits/rentalUnits.repository';
import {
  cancelReservation,
  insertReservation,
} from '../modules/reservations/reservations.repository';
import { buildSeedPlan, deriveDashboardState, type SeedRentalUnit } from './seedPlan';

/**
 * Applies the seed plan (`seedPlan.ts`) to the database.
 *
 * Two entry points, deliberately separate:
 *
 *  - `seedIfEmpty()` — what `server.ts` calls on boot. Does nothing unless the database
 *    is completely empty, so `docker compose up` yields a populated dashboard on a fresh
 *    volume and leaves a working database alone on every subsequent start.
 *  - `runSeed({ force })` — what `npm run seed` calls. Ignores `SEED_ON_STARTUP` and can
 *    wipe first, because an explicit command should do what it says.
 */

/**
 * Distinct from the migration's lock id (db/migrate.ts) on purpose: they guard different
 * things and must not serialise against each other, or a second replica would block on
 * the seed before it could even confirm the schema exists.
 */
const SEED_ADVISORY_LOCK_ID = 8_472_020;

export interface SeedOutcome {
  seeded: boolean;
  /** Why nothing was written, when `seeded` is false. */
  reason?: 'disabled' | 'already-populated';
  rentalUnits: number;
  reservations: number;
}

export interface RunSeedOptions {
  /** Delete existing rows first. Never set from the boot path. */
  force?: boolean;
}

/**
 * "Empty" means *no rows at all*, in either table — not "no active units".
 *
 * Counting only active units would make the seed reappear after an operator soft-deleted
 * everything, silently resurrecting a demo dataset in a database somebody was using. The
 * bar for writing fixture data into a database that already has history should be that
 * there is no history.
 */
async function isEmpty(db: pg.PoolClient): Promise<boolean> {
  const { rows } = await db.query<{ populated: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM rental_units)
         OR EXISTS (SELECT 1 FROM reservations) AS populated`,
  );

  return rows[0]?.populated === false;
}

/**
 * The one raw statement in this module.
 *
 * There is no repository method for "delete everything" and there should not be — hard
 * deletes are not part of the API's vocabulary (§3.6 soft-deletes units and cancels
 * reservations). `--force` is a local development affordance, so it reaches past the
 * domain layer rather than pretending to be a domain operation. `CASCADE` handles the
 * foreign key; both tables are named anyway so the order is irrelevant.
 */
async function truncateAll(db: pg.PoolClient): Promise<void> {
  await db.query('TRUNCATE TABLE reservations, rental_units RESTART IDENTITY CASCADE');
}

/**
 * Writes one planned unit and its reservations **through the repositories**, not in raw
 * SQL.
 *
 * That is the load-bearing choice in this function. The repositories are the same code
 * path the API uses, so a fixture that violates the exclusion constraint — most plausibly
 * by someone editing an offset in `seedPlan.ts` until two stays on one unit overlap —
 * fails here, at boot, with SQLSTATE 23P01, instead of being quietly accepted by an
 * INSERT that bypassed the layer where that mistake is caught. A seed that can create
 * data the API itself would reject is a seed that lies about what the system permits.
 *
 * Both create schemas are run first for the same reason: the seed should not be able to
 * insert a rental unit the API would have rejected with a 400. That is what makes the
 * `timezone` values below genuinely validated against `timezoneSchema` rather than
 * assumed valid.
 */
async function insertUnit(
  db: pg.PoolClient,
  unit: SeedRentalUnit,
): Promise<{ reservations: number }> {
  const input = createRentalUnitSchema.parse({
    name: unit.name,
    timezone: unit.timezone,
    ...(unit.address !== undefined ? { address: unit.address } : {}),
  });

  const created = await rentalUnitsRepository.insert({ id: randomUUID(), ...input }, db);

  for (const reservation of unit.reservations) {
    const reservationInput = createReservationSchema.parse({
      rentalUnitId: created.id,
      guestName: reservation.guestName,
      startDate: reservation.startDate,
      endDate: reservation.endDate,
    });

    const inserted = await insertReservation(db, { id: randomUUID(), ...reservationInput });

    // Cancelled rows are created confirmed and then cancelled, because that is the only
    // transition the domain has: `insertReservation` omits `status` so the column default
    // applies (§3.6 — a reservation is born confirmed and DELETE cancels it). Writing
    // 'cancelled' directly would be a second way to reach that state, available only to
    // the seed.
    if (reservation.status === 'cancelled') {
      await cancelReservation(db, inserted.id);
    }
  }

  return { reservations: unit.reservations.length };
}

/**
 * Seeds, under an advisory lock, in one transaction.
 *
 * The lock is what makes "only when empty" safe with more than one API replica. Without
 * it, two instances booting against a fresh database both read empty, both insert, and
 * the dashboard shows every unit twice — the emptiness check is a read-then-write race in
 * exactly the way the reservation pre-check is (§4), except here there is no constraint
 * to catch it, because "the database should contain one copy of the fixtures" is not an
 * invariant Postgres can express. So this one really does need mutual exclusion.
 *
 * `pg_advisory_xact_lock` rather than the session-scoped variant: it is released by
 * COMMIT or ROLLBACK, so a seed that throws half way cannot leave the lock held by an
 * idle pooled connection and wedge every subsequent boot.
 *
 * One transaction around the whole plan means a failure rolls back to empty rather than
 * leaving a half-seeded database that the next boot would consider "populated" and skip.
 *
 * This does rely on READ COMMITTED, the Postgres default: the emptiness check runs after
 * the lock is granted and takes a fresh snapshot at that point, so it sees the rows the
 * instance ahead of us just committed. Under REPEATABLE READ the snapshot would predate
 * their commit and both instances would seed. Nothing in this codebase changes the
 * isolation level, and the assumption is written down here rather than discovered later.
 */
export async function runSeed(options: RunSeedOptions = {}): Promise<SeedOutcome> {
  const force = options.force ?? false;

  return withTransaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock($1)', [SEED_ADVISORY_LOCK_ID]);

    if (force) {
      await truncateAll(db);
    } else if (!(await isEmpty(db))) {
      console.info('[seed] database already contains data, skipping');
      return { seeded: false, reason: 'already-populated', rentalUnits: 0, reservations: 0 };
    }

    const plan = buildSeedPlan();
    let reservations = 0;

    for (const unit of plan) {
      const result = await insertUnit(db, unit);
      reservations += result.reservations;

      // Logged per unit, with the state the plan expects the dashboard to report. It makes
      // a wrong-looking dashboard diagnosable from the boot log alone: if the badge and
      // this line disagree, the bug is in the query, and if they agree the fixture is what
      // needs changing.
      const expected = deriveDashboardState(unit);
      console.info(
        `[seed] ${unit.name} (${unit.timezone}) local ${unit.localDate} → ` +
          `${expected.occupancy}` +
          `${expected.currentGuest !== null ? `, guest ${expected.currentGuest}` : ''}` +
          `${expected.nextCheckInGuest !== null ? `, next ${expected.nextCheckInGuest}` : ''}`,
      );
    }

    console.info(
      `[seed] created ${plan.length} rental units and ${reservations} reservations` +
        `${force ? ' (--force: existing data was removed)' : ''}`,
    );

    return { seeded: true, rentalUnits: plan.length, reservations };
  });
}

/**
 * The boot-time entry point, called by `server.ts`.
 *
 * `SEED_ON_STARTUP` is re-checked here even though `server.ts` already checks it. That is
 * not redundancy for its own sake: this function is the one any future caller will reach
 * for, and the flag means "do not seed on boot", so the guard belongs on the boot-path
 * function rather than only at the single call site that exists today. `npm run seed`
 * deliberately calls `runSeed` instead, and is therefore unaffected by the flag — a
 * developer typing the command has already expressed the intent the flag would suppress.
 */
export async function seedIfEmpty(): Promise<SeedOutcome> {
  if (!env.SEED_ON_STARTUP) {
    console.info('[seed] SEED_ON_STARTUP=false, skipping');
    return { seeded: false, reason: 'disabled', rentalUnits: 0, reservations: 0 };
  }

  return runSeed({ force: false });
}
