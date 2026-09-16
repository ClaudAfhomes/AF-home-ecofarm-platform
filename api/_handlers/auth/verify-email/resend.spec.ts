import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import resendHandler from './resend.js';

/**
 * POST /auth/verify-email/resend - re-issues the self-managed code via
 * EmailJS; no code is ever returned by the real API (FEAT-009). Supabase is
 * mocked and the EmailJS HTTP call is stubbed.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; arg?: unknown }[] = [];
  const script = {
    row: null as Record<string, unknown> | null,
    upsertError: null as { message: string } | null,
  };
  const chain = () => {
    const c: Record<string, (...a: never[]) => unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data: script.row, error: null });
    c.upsert = async (row: unknown) => {
      calls.push({ op: 'upsert', arg: row });
      return { error: script.upsertError };
    };
    c.update = () => ({ eq: async () => ({ error: null }) });
    return c;
  };
  return {
    calls,
    script,
    service: {
      from: () => chain(),
      auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => mocks.service }));

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
    vi.stubEnv('EMAIL_OTP_PEPPER', 'test-pepper');
    vi.stubEnv('EMAILJS_SERVICE_ID', 'service_test');
    vi.stubEnv('EMAILJS_TEMPLATE_ID', 'template_test');
    vi.stubEnv('EMAILJS_PUBLIC_KEY', 'public_test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('OK', { status: 200 })),
    );
    mocks.calls.length = 0;
    mocks.script.row = null;
    mocks.script.upsertError = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('400s a malformed body without issuing a code', async () => {
    const { res, seen } = capture();
    await resendHandler(postReq({}), res);
    expect(seen.status).toBe(400);
    expect(mocks.calls.some((c) => c.op === 'upsert')).toBe(false);
  });

  it('re-issues the code and returns the email only (no devOnlyCode in prod)', async () => {
    const { res, seen } = capture();
    await resendHandler(postReq({ email: 'a@b.com' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ email: 'a@b.com' });
    expect((seen.body as { devOnlyCode?: string }).devOnlyCode).toBeUndefined();
    expect(mocks.calls.find((c) => c.op === 'upsert')?.arg).toMatchObject({ email: 'a@b.com' });
  });

  it('429s during the resend cooldown without sending again', async () => {
    mocks.script.row = {
      email: 'a@b.com',
      code_hash: 'x',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      sent_at: new Date(Date.now() - 10_000).toISOString(),
      attempts: 0,
      send_count: 1,
      window_start: new Date().toISOString(),
    };
    const { res, seen } = capture();
    await resendHandler(postReq({ email: 'a@b.com' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ retryAfterSeconds: expect.any(Number) });
  });

  it('429s once the hourly send cap is reached', async () => {
    mocks.script.row = {
      email: 'a@b.com',
      code_hash: 'x',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      sent_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      attempts: 0,
      send_count: 5,
      window_start: new Date(Date.now() - 30 * 60_000).toISOString(),
    };
    const { res, seen } = capture();
    await resendHandler(postReq({ email: 'a@b.com' }), res);
    expect(seen.status).toBe(429);
    expect(seen.body).toMatchObject({ error: { code: 'TOO_MANY_REQUESTS' } });
  });

  it('503s when the code cannot be sent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('DOWN', { status: 500 })),
    );
    const { res, seen } = capture();
    await resendHandler(postReq({ email: 'a@b.com' }), res);
    expect(seen.status).toBe(503);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});
