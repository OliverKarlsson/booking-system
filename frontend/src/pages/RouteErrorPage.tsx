import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { ErrorBanner } from '@/components/ui';
import { PageContainer } from '@/components/layout';
import { isApiError } from '@/lib/apiClient';

/**
 * The router's `errorElement`: the last stop for an exception thrown while rendering a
 * route, so a bug in one feature shows a message instead of a blank page.
 */
export function RouteErrorPage() {
  const error = useRouteError();

  let message = 'An unexpected error occurred while rendering this page.';
  if (isApiError(error)) {
    message = error.message;
  } else if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <PageContainer>
      <ErrorBanner
        title="This page failed to load"
        message={message}
        onRetry={() => window.location.reload()}
        retryLabel="Reload"
      />
    </PageContainer>
  );
}
