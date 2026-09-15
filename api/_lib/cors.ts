import type { VercelRequest, VercelResponse } from './http.js';

const DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
]);

function allowedOrigins(): Set<string> {
  const set = new Set(DEV_ORIGINS);
  for (const v of [process.env.VITE_WEB_URL, process.env.VITE_ADMIN_URL]) {
    if (v) set.add(v.replace(/\/+$/, ''));
  }
  return set;
}

/**
 * CORS for the same-origin deployment. Only the app's own origins (from
 * `VITE_WEB_URL` / `VITE_ADMIN_URL`, plus localhost dev) receive CORS headers;
 * any other origin gets none, so the browser blocks cross-origin reads of the
 * response. Never sends `Access-Control-Allow-Origin: *` — with header-based
 * auth there is no legitimate cross-origin caller to wildcard-open.
 */
export function setCors(
  res: VercelResponse,
  req: VercelRequest,
  methods: string,
  headers = 'Content-Type, Authorization',
): void {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  if (origin && allowedOrigins().has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', headers);
}
