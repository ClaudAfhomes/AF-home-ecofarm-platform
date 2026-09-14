import { listResponseSchema } from '@jad/contracts';
import type { ZodType } from 'zod';

import { env } from '../env';
import { ApiNetworkError, ApiParseError, toApiError } from './errors';
import { clearSession, isSupabaseConfigured, tryRefreshSession } from '../supabase';

/**
 * Single typed fetch-based API client (FRONTEND-ARCHITECTURE §5). All requests
 * go through here — no ad-hoc `fetch` in features.
 *
 * The admin panel consumes authenticated endpoints protected by the
 * HttpOnly-session architecture (ARCH-DEC-007): cookies are sent for
 * same-origin requests via the safe default `credentials: 'same-origin'`
 * (the default `/api/v1` deployment). No tokens are stored in the browser.
 */
async function rawRequest(path: string, init?: RequestInit, retried = false): Promise<Response> {
  const url = `${env.VITE_API_BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init?.headers,
      },
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
