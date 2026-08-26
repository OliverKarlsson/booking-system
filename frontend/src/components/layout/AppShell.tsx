import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { PageContainer } from './PageContainer';

/**
 * The application chrome, mounted as the router's layout route. Every page renders
 * into the `<Outlet />`, so navigation swaps only the page body and the header stays
 * mounted — which is also why the nav's active state does not flicker on route change.
 */
export function AppShell() {
  return (
    <div className="min-h-screen bg-ink-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <Header />
      <main id="main">
        <PageContainer>
          <Outlet />
        </PageContainer>
      </main>
    </div>
  );
}
