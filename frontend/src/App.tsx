import { RouterProvider } from 'react-router-dom';
import { QueryProvider } from '@/lib/QueryProvider';
import { router } from '@/router';

export function App() {
  return (
    <QueryProvider>
      <RouterProvider router={router} />
    </QueryProvider>
  );
}
