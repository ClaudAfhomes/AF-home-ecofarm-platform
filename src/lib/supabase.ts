import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env';
import type { Database } from './database.types';

const env = loadEnv();
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  const startedAt = performance.now();

  try {
    const response = await fetch(input, { ...init, signal });
    if (!response.ok) {
      console.error('[supabase] request failed', {
        method: init?.method ?? 'GET',
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
    return response;
  } catch (error) {
    console.error('[supabase] request did not complete', {
      method: init?.method ?? 'GET',
      timedOut: timeoutSignal.aborted,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.name : 'UnknownError',
    });
    if (timeoutSignal.aborted) {
      throw new Error('The secure data request timed out. Please try again.', { cause: error });
    }
    throw error;
  }
}

export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: fetchWithTimeout },
  },
);
