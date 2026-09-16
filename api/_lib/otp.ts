import { anonClient } from './rest.js';

/**
 * Anon (client-scoped) Supabase client for user-facing Auth endpoints
 * (`signInWithOtp` / `verifyOtp`). These are GoTrue *client* endpoints — the
 * anon key is the right credential; the service key stays reserved for
 * `auth.admin.*`. Returns null when unconfigured so callers can 500 loudly.
 */
export function requireAnonClient() {
  return anonClient();
}
