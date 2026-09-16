/**
 * API-shaped mock server. Stands in for the not-yet-built REST API during
 * F0/F1: intercepts `fetch` and returns contract-shaped JSON (or an error
 * envelope) for configured paths. Routes match by URL suffix because the client
 * prefixes `VITE_API_BASE_URL` (default `/api/v1`). Replaced by the real API in
 * production - the app's service functions and components are untouched.
 *
 * F1 extension: routes may declare a `method` (matched exactly, case-insensitive)
 * and a `handler` that receives the parsed request context (method, headers,
 * body) so stateful, server-shaped behavior (login, registration, sales with an
 * `Idempotency-Key`) can be simulated. `response` may also be a function that
 * receives the same context. Existing method-less static routes keep working.
 */
export type MockResponseBody = unknown | { body: unknown; status: number };

export interface MockRequestContext {
  /** The matched route path. */
  path: string;
  /** Full request URL (including the `VITE_API_BASE_URL` prefix). */
  url: string;
  /** HTTP method, uppercased. */
  method: string;
  /** Request headers as a plain record (lower-cased keys). */
  headers: Record<string, string>;
  /** Parsed JSON request body (undefined when absent/unparseable). */
  body: unknown;
  /** Case-insensitive header lookup. */
  header: (name: string) => string | undefined;
}

export type MockHandler = (ctx: MockRequestContext) => MockResponseBody;

export interface MockRoute {
  /** URL segment matched against the request URL. */
  path: string;
  /** Match strategy (default `suffix`): `suffix` = URL ends with path; `prefix` = URL starts with path (for dynamic segments such as `/sales/:id`). */
  match?: 'suffix' | 'prefix';
  /** Exact method match (case-insensitive); omitted = any method. */
  method?: string;
  /** Static body or a function of the request context. */
  response?: MockResponseBody | ((ctx: MockRequestContext) => MockResponseBody);
  /** Stateful handler of the request context (preferred for F1 routes). */
  handler?: MockHandler;
  /** Per-route latency (ms); overrides the server default. */
  latencyMs?: number;
}

export interface MockServer {
  install: () => void;
  restore: () => void;
}

function isStatusConfig(value: unknown): value is { body: unknown; status: number } {
  return typeof value === 'object' && value !== null && 'body' in value;
}

function notFoundEnvelope(): unknown {
  return {
    error: {
      code: 'NOT_FOUND',
      message: 'Not found',
      timestamp: new Date().toISOString(),
    },
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Parse an incoming JSON body from the RequestInit string body. */
function parseBody(init: RequestInit | undefined): unknown {
  const raw = init?.body;
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function lowerHeaders(init: RequestInit | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  const headers = init?.headers;
  if (!headers) return record;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key.toLowerCase()] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      record[key.toLowerCase()] = String(value);
    }
  } else {
    for (const [key, value] of Object.entries(headers)) {
      record[key.toLowerCase()] = String(value);
    }
  }
  return record;
}

export function createMockServer(routes: MockRoute[], defaultLatencyMs = 120): MockServer {
  const originalFetch = globalThis.fetch;

  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = lowerHeaders(init);
    const body = parseBody(init);

    // Route matching is against the pathname only - query strings (cursor,
    // filters) are part of the request, not the route identity. Suffix routes
    // match when the pathname ends with the route path (the client prefixes
    // `VITE_API_BASE_URL`, e.g. `/api/v1`). Prefix routes match dynamic
    // segments anywhere in the pathname so the base prefix is transparent.
    const pathOnly = new URL(url, 'http://mock.local').pathname;

    // Dev passthrough for real location verification - GPS → Nominatim backend
    // Browser dev should hit the real handler via Vite proxy → localhost:3000 (Nominatim).
    // Fixture mock in handlers.ts is fallback for isolated tests only - do NOT use in browser dev.
    // Vitest tests stub fetch via mockFetchRoutes/vi.stubGlobal, so they don't need this passthrough.
    const isVitest =
      typeof process !== 'undefined' &&
      // @ts-ignore
      (process.env?.VITEST === 'true' || process.env?.VITEST === true);
    if (
      !isVitest &&
      (pathOnly.endsWith('/registration/location-verify') ||
        pathOnly.includes('/registration/location-verify'))
    ) {
      return originalFetch(input as RequestInfo, init);
    }

    const route = routes.find((candidate) => {
      const matches =
        candidate.match === 'prefix'
          ? pathOnly.includes(candidate.path)
          : pathOnly.endsWith(candidate.path);
      if (!matches) return false;
      if (candidate.method && candidate.method.toUpperCase() !== method) return false;
      return true;
    });

    const latencyMs = route?.latencyMs ?? defaultLatencyMs;
    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }

    if (!route) {
      // Bypass for real CMS API - let it reach Vercel/Supabase instead of mock 404
      if (pathOnly.startsWith('/api/v1/cms/')) {
        return originalFetch(input as RequestInfo, init);
      }
      // Passthrough for non-mock external requests (Supabase Auth/PostgREST etc.).
      // Keep 404 for mock API routes under /api/* so tests and dev still see NOT_FOUND for unmocked API paths.
      if (pathOnly.startsWith('/api/')) {
        return jsonResponse(notFoundEnvelope(), 404);
      }
      return originalFetch(input as RequestInfo, init);
    }

    const ctx: MockRequestContext = {
      path: route.path,
      url,
      method,
      headers,
      body,
      header: (name: string) => headers[name.toLowerCase()],
    };

    const resolved = route.handler
      ? route.handler(ctx)
      : typeof route.response === 'function'
        ? (route.response as (c: MockRequestContext) => MockResponseBody)(ctx)
        : route.response;

    const { body: responseBody, status } = isStatusConfig(resolved)
      ? resolved
      : { body: resolved, status: 200 };
    return jsonResponse(responseBody, status);
  };

  return {
    install: () => {
      globalThis.fetch = handler as typeof fetch;
    },
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
