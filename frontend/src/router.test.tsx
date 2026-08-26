import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { QueryProvider } from './lib/QueryProvider';
import { createQueryClient } from './lib/queryClient';
import { routes } from './router';

/**
 * The provider is not optional here. Once a page actually fetches, rendering it without
 * a QueryClient throws "No QueryClient set", the router's errorElement swallows it, and
 * these assertions fail against an error page rather than the route they name — a
 * failure that looks like a routing bug but isn't. A fresh client per render keeps
 * cached data from leaking between cases.
 */
function renderAt(initialPath: string) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return render(
    <QueryProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryProvider>,
  );
}

/**
 * Guards the shell contract that Waves 2 and 3 build on: every route is already
 * mounted, and the header navigates between them. A feature agent replacing a stub's
 * body should never have to touch the router — if these break, something edited it.
 */
describe('router', () => {
  it.each([
    ['/', 'Dashboard'],
    ['/units', 'Rental units'],
    ['/reservations', 'Reservations'],
  ])('renders the page mounted at %s', (path, heading) => {
    renderAt(path);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('renders the detail route and passes through the :id param', () => {
    renderAt('/units/11111111-1111-4111-8111-111111111111');
    expect(screen.getByRole('heading', { level: 1, name: 'Rental unit' })).toBeInTheDocument();
    expect(screen.getByText('11111111-1111-4111-8111-111111111111')).toBeInTheDocument();
  });

  it('navigates between pages from the header nav', async () => {
    const user = userEvent.setup();
    renderAt('/');

    await user.click(screen.getByRole('link', { name: 'Reservations' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Reservations' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Rental units' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Rental units' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('marks the current page in the nav for assistive tech', () => {
    renderAt('/units');
    expect(screen.getByRole('link', { name: 'Rental units' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('shows a not-found page for an unknown URL rather than a blank screen', () => {
    renderAt('/nope');
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    // The shell stays mounted, so the user can navigate away.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});
