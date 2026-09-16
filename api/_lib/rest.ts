import { createClient } from '@supabase/supabase-js';

import { getSupabaseEnv } from './env.js';
import { toErrorEnvelope } from './envelope.js';
import type { VercelResponse } from './http.js';

/**
 * Shared REST helpers for api/ collection handlers: list envelopes matching
 * what `requestList` validates (`{ data, meta: { page, pageSize, total } }`),
 * service-role client acquisition, and small error shortcuts.
 *
 * Clients are cached per Vercel instance (keyed by the resolved key) instead
 * of rebuilt on every request — supabase-js re-initializes its realtime/
 * storage machinery on each `createClient`, which is pure overhead here.
 *
 * The cache variables are typed from the `createClient(...)` call (via the
 * unannotated factory) so the client keeps its exact inferred type — the same
 * inference the pre-cache code relied on.
 */

function makeServiceClient(url: string, serviceKey: string) {
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false } });
}

function makeAnonClient(url: string, anonKey: string) {
  return createClient(url, anonKey, { auth: { autoRefreshToken: false } });
}

/** Cached service-role client (keyed by key so a changed env rebuilds). */
let serviceClientCached: ReturnType<typeof makeServiceClient> | null = null;
let serviceClientKey = '';

/** Cached anon (client-scoped) client for `auth.getUser` / OTP endpoints. */
let anonClientCached: ReturnType<typeof makeAnonClient> | null = null;
let anonClientKey = '';

/** Service-role client, or null when unconfigured. Callers respond 500. */
export function serviceClient() {
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) return null;
  if (!serviceClientCached || serviceClientKey !== serviceKey) {
    serviceClientCached = makeServiceClient(url, serviceKey);
    serviceClientKey = serviceKey;
  }
  return serviceClientCached;
}

/** Anon (client-scoped) client, or null when unconfigured. */
export function anonClient() {
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) return null;
  if (!anonClientCached || anonClientKey !== anonKey) {
    anonClientCached = makeAnonClient(url, anonKey);
    anonClientKey = anonKey;
  }
  return anonClientCached;
}

export function okList(res: VercelResponse, rows: unknown[]): void {
  res
    .status(200)
    .json({ data: rows, meta: { page: 1, pageSize: rows.length, total: rows.length } });
}

export function methodNotAllowed(res: VercelResponse, method: string | undefined): void {
  const { error, status } = toErrorEnvelope('NOT_FOUND', `Method ${method} not allowed`, 405);
  res.status(status).json({ error });
}

/** Service-role client, or a 500 already sent (returns null in that case). */
export function requireService(res: VercelResponse) {
  const supabase = serviceClient();
  if (!supabase) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return null;
  }
  return supabase;
}

/** Parse a JSON-capable request body (dev-server pre-parses; Vercel may give a string). */
export function readJsonBody(req: {
  body?: unknown;
}): { ok: true; body: unknown } | { ok: false; error: ReturnType<typeof toErrorEnvelope> } {
  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { ok: false, error: toErrorEnvelope('VALIDATION_ERROR', 'Invalid JSON body', 400) };
    }
  }
  return { ok: true, body };
}
