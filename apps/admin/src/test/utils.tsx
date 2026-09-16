import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';

import { SessionProvider, type SessionUser } from '../lib/session';
import { adminMockHandlers } from '../mock/handlers';
import { createMockServer } from '@jad/mock';

/**
 * Test renderer mirroring the providers used in `main.tsx`: fresh QueryClient
 * (no retries), MemoryRouter, and the app session provider (restore instant).
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/admin',
    user,
    onRevalidate,
  }: { route?: string; user?: SessionUser; onRevalidate?: () => void | Promise<void> } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <SessionProvider initialUser={user} restoreDelayMs={0} onRevalidate={onRevalidate}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </SessionProvider>,
  );
  return { ...result, client };
}

/** Install the admin mock API with zero latency; returns the server for `restore()`. */
export function installMockApi() {
  return createMockServer(adminMockHandlers, 0);
}
