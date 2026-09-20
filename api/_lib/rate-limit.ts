import type { VercelRequest, VercelResponse } from './http.js';

import { toErrorEnvelope } from './envelope.js';

/**
 * Per-IP request throttling for public endpoints (API-SPEC §5.2). Sliding
 * window, in-memory per function instance - Vercel Functions are ephemeral,
 * so this is a best-effort brake (like the DB-backed ContactInquiry throttle)
 * not a distributed quota. Public, side-effect-heavy endpoints (registration
 * intake, code sends, geocoding) get a cheap protection against floods.
 */

/** Default sliding window: 15 minutes. */
export const RATE_LIMIT_WINDOW_MS = 15 * 60_000;

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** Extract the client IP from Vercel's proxy headers ('unknown' when absent). */
export function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = (first ?? '').split(',')[0]?.trim();
  if (ip) return ip;
  const realIp = req.headers['x-real-ip'];
  const real = Array.isArray(realIp) ? realIp[0] : realIp;
  return ((real ?? '') as string).trim() || 'unknown';
}

export type RateLimitConfig = {
  /** Route scope - keeps limits independent per endpoint. */
  scope: string;
  /** Max requests allowed inside the window. */
  max: number;
  /** Window length in ms (default 15 minutes). */
  windowMs?: number;
};

/**
 * Enforce a per-IP sliding-window limit. When the limit is exceeded the 429
 * envelope (with a Retry-After header) is written to the response and the
 * handler must stop; otherwise the request is recorded and the caller
 * continues. Returns true when the request may proceed.
 */
export function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  config: RateLimitConfig,
): boolean {
  const windowMs = config.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const now = Date.now();

  // Periodic sweep so idle buckets do not accumulate forever per instance.
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [key, bucket] of buckets) {
      const kept = bucket.hits.filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
      if (kept.length === 0) buckets.delete(key);
      else bucket.hits = kept;
    }
  }

  const key = `${config.scope}:${clientIp(req)}`;
  const bucket = buckets.get(key);
  const hits = (bucket?.hits ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= config.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    const { error, status } = toErrorEnvelope(
      'TOO_MANY_REQUESTS',
      'Too many requests. Please try again later.',
      429,
    );
    res.status(status).json({ error });
    return false;
  }
  hits.push(now);
  buckets.set(key, { hits });
  return true;
}

/** Test hook: clear all buckets (spec isolation). */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}
