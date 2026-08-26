import { EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';

/**
 * STUB — owned by T3.2 (reservation management UI + conflict UX).
 *
 * Replace the body of this component. It is already mounted at `/reservations` in
 * `src/router.tsx`; do not edit the router.
 *
 * The conflict path is the point of this screen: on a 409, use `isBookingConflict` from
 * `@/lib/apiClient` to narrow the error, then render a message naming the conflicting
 * guest and dates — `formatDateRange` in `@/lib/formatDate` produces "12–15 March 2026".
 * Show it on the form, not in a toast.
 */
export function ReservationsPage() {
  return (
    <>
      <PageHeader title="Reservations" description="Bookings across every rental unit." />
      <EmptyState
        title="Reservations not built yet"
        description="This page is a Wave 1 stub. T3.2 fills it in with the filtered list, forms, and conflict handling."
      />
    </>
  );
}
