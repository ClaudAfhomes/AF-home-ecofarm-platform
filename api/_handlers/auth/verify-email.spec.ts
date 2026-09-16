import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import verifyEmailHandler from './verify-email.js';

/**
 * POST /auth/verify-email — OTP verification against Supabase Auth, then an
 * authoritative `email_confirm: true` via the admin API (BR-AUTH-001).
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; arg?: unknown }[] = [];
  const script = {
    verifyError: null as { message: string } | null,
    confirmError: null as { message: string } | null,
  };
  return {
    calls,
    script,
    anon: {
      auth: {
        verifyOtp: async (input: unknown) => {
          calls.push({ op: 'verifyOtp', arg: input });
          if (mocks.script.verifyError) return { data: {}, error: mocks.script.verifyError };
          return { data: { user: { id: 'auth-uuid' } }, error: null };
        },
      },
    },
    service: {
      auth: {
        admin: {
          updateUserById: async (id: string, patch: unknown) => {
            calls.push({ op: 'updateUserById', arg: { id, patch } });
            if (mocks.script.confirmError) return { data: {}, error: mocks.script.confirmError };
            return { data: { user: { id } }, error: null };
          },
        },
      },
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => (key === 'anon' ? mocks.anon : mocks.service),
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

describe('POST /api/v1/auth/verify-email', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://verify.test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    mocks.calls.length = 0;
    mocks.script.verifyError = null;
    mocks.script.confirmError = null;
  });

  it('400s a malformed body', async () => {
    const { res, seen } = capture();
    await verifyEmailHandler(postReq({ email: 'nope' }), res);
    expect(seen.status).toBe(400);
    expect(mocks.calls.some((c) => c.op === 'verifyOtp')).toBe(false);
  });

  it('verifies the OTP and confirms the email authoritatively', async () => {
    const { res, seen } = capture();
    await verifyEmailHandler(postReq({ email: 'a@b.com', code: '123456' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ email: 'a@b.com' });
    expect(typeof (seen.body as { verifiedAt: string }).verifiedAt).toBe('string');
    expect(mocks.calls.find((c) => c.op === 'verifyOtp')?.arg).toEqual({
      email: 'a@b.com',
      token: '123456',
      type: 'email',
    });
    expect(mocks.calls.find((c) => c.op === 'updateUserById')?.arg).toEqual({
      id: 'auth-uuid',
      patch: { email_confirm: true },
    });
  });

  it('400s an incorrect or expired code', async () => {
    mocks.script.verifyError = { message: 'Invalid token' };
    const { res, seen } = capture();
    await verifyEmailHandler(postReq({ email: 'a@b.com', code: '000000' }), res);
    expect(seen.status).toBe(400);
    expect(seen.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(mocks.calls.some((c) => c.op === 'updateUserById')).toBe(false);
  });

  it('500s when the authoritative confirm fails', async () => {
    mocks.script.confirmError = { message: 'db down' };
    const { res, seen } = capture();
    await verifyEmailHandler(postReq({ email: 'a@b.com', code: '123456' }), res);
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});
