import { createBrowserRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/layout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { RentalUnitDetailPage } from '@/features/rentalUnits/RentalUnitDetailPage';
import { RentalUnitsPage } from '@/features/rentalUnits/RentalUnitsPage';
import { ReservationsPage } from '@/features/reservations/ReservationsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';

/**
 * Every route in the application, mounted up front against stub pages.
 *
 * This file is complete and **closed**: feature agents replace the contents of the page
 * components it points at, and never add a route or an import here. That is what lets
 * four agents build four screens in parallel without one file collecting four
 * conflicting edits.
 *
 * Routes are declared statically rather than lazily — the whole app is a handful of
 * screens, so code-splitting would buy nothing and cost a loading state per navigation.
 */
/**
 * The route table, separated from the browser router so tests can mount the same
 * definitions in a memory router. Two copies of the routes would defeat the point of
 * testing them.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'units', element: <RentalUnitsPage /> },
      { path: 'units/:id', element: <RentalUnitDetailPage /> },
      { path: 'reservations', element: <ReservationsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
