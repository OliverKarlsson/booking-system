import { useState } from 'react';
import { useBookingStore } from '@/store';
import { useRentalUnits } from './api';
import { RentalUnitListView } from './RentalUnitListView';
import { toErrorMessage } from '@/lib/errorMessage';

/**
 * Fetches the rental unit list and hands it to the view.
 *
 * The page number is local component state rather than a Zustand slice: it is not shared
 * with any other screen and is not part of the reservation filters, so putting it in the
 * store would make it survive navigation in a way nobody asked for.
 */
export function RentalUnitList() {
  const [page, setPage] = useState(1);
  const openModal = useBookingStore((state) => state.openModal);
  const query = useRentalUnits(page);

  return (
    <RentalUnitListView
      units={query.data?.data ?? []}
      pagination={query.data?.pagination}
      isLoading={query.isPending}
      isError={query.isError}
      errorMessage={query.error ? toErrorMessage(query.error) : undefined}
      onRetry={() => void query.refetch()}
      onPageChange={setPage}
      onCreate={() => openModal('createRentalUnit')}
      onEdit={(id) => openModal('editRentalUnit', id)}
    />
  );
}
