import type { StateCreator } from 'zustand';
import type { BookingStore } from './types';

/**
 * Every modal in the app, named. A union rather than a boolean per modal so that
 * "exactly one modal is open" is unrepresentable-otherwise instead of something each
 * feature has to remember to enforce.
 */
export type ModalName =
  | 'createRentalUnit'
  | 'editRentalUnit'
  | 'createReservation'
  | 'editReservation'
  | 'cancelReservation';

export interface UiSlice {
  activeModal: ModalName | null;
  /**
   * The id of the record the open modal is acting on — the reservation being edited or
   * cancelled, the unit being edited. `null` for create modals.
   *
   * Only the *id* lives here, never the record itself: the record is server state, and
   * a copy of it in the store would go stale the moment anything else refetches.
   */
  editingId: string | null;
  openModal: (modal: ModalName, editingId?: string | null) => void;
  closeModal: () => void;
}

export const createUiSlice: StateCreator<BookingStore, [], [], UiSlice> = (set) => ({
  activeModal: null,
  editingId: null,

  openModal: (modal, editingId = null) => set({ activeModal: modal, editingId }),

  // Clearing `editingId` alongside the modal matters: a stale id left behind would be
  // picked up by the next modal that opens without one.
  closeModal: () => set({ activeModal: null, editingId: null }),
});
