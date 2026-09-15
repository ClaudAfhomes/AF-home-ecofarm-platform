import { listResponseSchema } from '@jad/contracts';
import type { ZodType } from 'zod';

import { env } from '../env';
import { ApiNetworkError, ApiParseError, toApiError } from './errors';
import {
  clearSession,
  getSupabaseClient,
  isSupabaseConfigured,
  tryRefreshSession,
} from '../supabase';

/**
 * Single typed fetch-based API client (FRONTEND-ARCHITECTURE §5). All requests
 * go through here — no ad-hoc `fetch` in features.
 *
 * Auth: the session is a Supabase JWT. When Supabase is configured, the access
 * token is attached as `Authorization: Bearer` on every request (the API
 * accepts Bearer or the PKCE cookie). Production stores the session in
 * localStorage, so the Bearer header is what the API actually reads; public
 * endpoints ignore the header and expired tokens are healed via the 401 path
 * below. Credentials stay `same-origin` (the default `/api/v1` deployment).
 */
async function rawRequest(path: string, init?: RequestInit, retried = false): Promise<Response> {
  const url = `${env.VITE_API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (isSupabaseConfigured()) {
    const client = getSupabaseClient();
    const { data } = (await client?.auth.getSession()) ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      credentials: init?.credentials ?? 'same-origin',
    });
  } catch (cause) {
    throw new ApiNetworkError(cause);
  }
  // Expired/rotated sessions surface as 401 (the API never returns 401 for a
  // merely under-privileged caller — that's 403). Heal once via rotation and
  // retry; if rotation fails the session is dead, so clear it and let the
  // route guards redirect to login instead of stranding an error page.
  if (res.status === 401 && !retried && isSupabaseConfigured()) {
    const healed = await tryRefreshSession();
    if (healed) return rawRequest(path, init, true);
    await clearSession();
  }
  return res;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** GET a single resource; validates against `schema`; throws ApiError / ApiParseError. */
export async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await rawRequest(path, init);
  const body = await parseBody(res);

  if (!res.ok) {
    throw toApiError(body, res.status);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiParseError(path, parsed.error.message);
  }
  return parsed.data;
}

/** GET a collection; validates `{ data, meta }` and returns `data` (API-SPECIFICATION §1.1/§4). */
export async function requestList<T>(
  path: string,
  itemSchema: ZodType<T>,
  init?: RequestInit,
): Promise<T[]> {
  const listSchema = listResponseSchema(itemSchema);
  const res = await rawRequest(path, init);
  const body = await parseBody(res);

  if (!res.ok) {
    throw toApiError(body, res.status);
  }

  const parsed = listSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiParseError(path, parsed.error.message);
  }
  return parsed.data.data;
}

/**
 * GET a collection and return the full `{ data, meta }` envelope — for callers
 * that need `meta` beyond the list (e.g. the registrations queue's
 * `meta.invalid` dropped-row count). Auth + 401 healing are identical to the
 * other helpers.
 */
export async function requestListEnvelope<T>(
  path: string,
  itemSchema: ZodType<T>,
  init?: RequestInit,
): Promise<{ data: T[]; meta: Record<string, unknown> }> {
  const listSchema = listResponseSchema(itemSchema);
  const res = await rawRequest(path, init);
  const body = await parseBody(res);

  if (!res.ok) {
    throw toApiError(body, res.status);
  }

  const parsed = listSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiParseError(path, parsed.error.message);
  }
  return { data: parsed.data.data, meta: (parsed.data.meta ?? {}) as Record<string, unknown> };
}

/** Cursor-paginated page of `{ data, meta.pagination.nextCursor }` (API-SPECIFICATION §4). */
export interface PageResult<T> {
  items: T[];
  nextCursor?: string;
}

/** GET a cursor-paginated collection (threads/ledger streams — API-SPECIFICATION §4). */
export async function requestPage<T>(
  path: string,
  itemSchema: ZodType<T>,
  init?: RequestInit,
): Promise<PageResult<T>> {
  const listSchema = listResponseSchema(itemSchema);
  const res = await rawRequest(path, init);
  const body = await parseBody(res);

  if (!res.ok) {
    throw toApiError(body, res.status);
  }

  const parsed = listSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiParseError(path, parsed.error.message);
  }
  const pagination = parsed.data.meta?.pagination as { nextCursor?: string } | undefined;
  return { items: parsed.data.data, nextCursor: pagination?.nextCursor };
}
