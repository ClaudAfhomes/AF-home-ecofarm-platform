import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import { App } from './app/App';
import './styles.css';

const logQueryError = (error: Error, context: string) => console.error('[data] request failed', { context, name: error.name, message: error.message });
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error, query) => logQueryError(error, query.queryHash) }),
  mutationCache: new MutationCache({ onError: (error, _variables, _context, mutation) => logQueryError(error, String(mutation.options.mutationKey ?? 'mutation')) }),
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>);
