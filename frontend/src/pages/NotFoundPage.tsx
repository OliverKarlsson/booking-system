import { Link } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="That URL does not match any screen in this application."
      action={
        <Link to="/">
          <Button>Back to the dashboard</Button>
        </Link>
      }
    />
  );
}
