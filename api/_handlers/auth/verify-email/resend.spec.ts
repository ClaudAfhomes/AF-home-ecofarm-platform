import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import resendHandler from './resend.js';

/**
 * POST /auth/verify-email/resend — re-issues the OTP via Supabase Auth
 * (`signInWithOtp`); no code is ever returned by the real API (FEAT-009).
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; arg?: unknown }[] = [];
  const script = {
    sendError: null as { message: string } | null,
  };
  return {
    calls,
    script,
    anon: {
      auth: {
        signInWithOtp: async (input: unknown) => {
          calls.push({ op: 'signInWithOtp', arg: input });
          if (mocks.script.sendError) return { data: {}, error: mocks.script.sendError };
          return { data: {}, error: null };
        },
      },
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mocks.anon,
}));

function capture() {
  const seen: { status?: number; body?: unknown } = {};
  const res: VercelResponse = {
    setHeader: () => {},
    status: (code: number) => {
      seen.status = code;
      return res;
    },
    json: (body: unknown) => {
      seen.body = body;
    },
    end: () => {},
  };
  return { res, seen };
}

const postReq = (body: unknown): VercelRequest =>
  ({ method: 'POST', query: {}, headers: {}, body }) as VercelRequest;

describe('POST /api/v1/auth/verify-email/resend', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://verify.test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    mocks.calls.length = 0;
    mocks.script.sendError = null;
  });

  it('400s a malformed body', async () => {
    const { res, seen } = capture();
    await resendHandler(postReq({}), res);
    expect(seen.status).toBe(400);
    expect(mocks.calls.some((c) => c.op === 'signInWithOtp')).toBe(false);
  });

  it('re-issues the OTP and returns the email only (no devOnlyCode in prod)', async () => {
    const { res, seen } = capture();
    await resendHandler(postReq({ email: 'a@b.com' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ email: 'a@b.com' });
    expect(mocks.calls.find((c) => c.op === 'signInWithOtp')?.arg).toEqual({
      email: 'a@b.com',
      options: { shouldCreateUser: false },
    });
  });

  it('400s when the code cannot be sent', async () => {
    mocks.script.sendError = { message: 'no such user' };
    const { res, seen } = capture();
    await resendHandler(postReq({ email: 'a@b.com' }), res);
    expect(seen.status).toBe(400);
    expect(seen.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('429s on GoTrue rate limiting', async () => {
    mocks.script.sendError = {
      message: 'For security purposes, you can only request this after 5 minutes',
    };
    const { res, seen } = capture();
    await resendHandler(postReq({ email: 'a@b.com' }), res);
    expect(seen.status).toBe(429);
    expect(seen.body).toMatchObject({ error: { code: 'TOO_MANY_REQUESTS' } });
  });
});
