import type { ConflictingReservation } from '@/lib/apiClient';
import { ErrorBanner } from '@/components/ui';
import { conflictMessage, conflictTitle } from './conflict';

export interface ConflictNoticeProps {
  conflicts: ConflictingReservation[];
}

/**
 * The 409 `BOOKING_CONFLICT`, rendered on the form.
 *
 * Deliberately an `ErrorBanner` inside the form rather than a toast: the user has to pick
 * different dates, and the information they need to pick them — who has the unit, and
 * until when — must still be on screen while they do it. A toast that names the
 * conflicting guest and then disappears after four seconds is, for this purpose, the same
 * as no message.
 *
 * There is no retry affordance for the same reason `queryClient` refuses to retry a 4xx:
 * the slot is taken, and asking again unchanged cannot succeed.
 */
export function ConflictNotice({ conflicts }: ConflictNoticeProps) {
  return (
    <ErrorBanner
      title={conflictTitle(conflicts)}
      message={
        <>
          <ul className="flex flex-col gap-0.5">
            {conflicts.map((conflict) => (
              <li key={conflict.id}>{conflictMessage(conflict)}</li>
            ))}
          </ul>
          <p className="mt-1.5">
            Pick different dates, or cancel the existing booking first. A stay ending on
            the day yours begins is not a conflict — same-day turnover is allowed.
          </p>
        </>
      }
    />
  );
}
