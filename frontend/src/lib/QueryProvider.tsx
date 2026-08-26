import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryClient as defaultQueryClient } from './queryClient';

interface QueryProviderProps {
  children: ReactNode;
  /** Tests pass an isolated client so cached data never leaks between cases. */
  client?: QueryClient;
}

export function QueryProvider({ children, client = defaultQueryClient }: QueryProviderProps) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
