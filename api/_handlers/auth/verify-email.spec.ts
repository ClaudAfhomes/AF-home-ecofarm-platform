import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import verifyEmailHandler from './verify-email.js';

/**
 * POST /auth/verify-email - self-managed code verification against the
 * stored hash, then an authoritative `email_confirm: true` via the admin
 * API (BR-AUTH-001). Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; arg?: unknown }[] = [];
  const script = {
    row: null as Record<string, unknown> | null,
    confirmError: null as { message: string } | null,
    updates: [] as Record<string, unknown>[],
  };
  const chain = () => {
    const c: Record<string, (...a: never[]) => unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data: script.row, error: null });
    c.update = (patch: Record<string, unknown>) => {
      script.updates.push(patch);
      return { eq: async () => ({ error: null }) };
    };
    return c;
  };
  return {
    calls,
    script,
    service: {
      from: () => chain(),
      auth: {
        admin: {
          updateUserById: async (id: string, patch: unknown) => {
            calls.push({ op: 'updateUserById', arg: { id, patch } });
            if (script.confirmError) return { data: {}, error: script.confirmError };
            return { data: { user: { id } }, error: null };
          },
          listUsers: async () => ({
            data: { users: [{ id: 'auth-legacy-uuid', email: 'legacy@b.com' }] },
            error: null,
          }),
        },
      },
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mocks.service,
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

function hashFor(email: string, code: string): string {
  return createHash('sha256').update(`${email}:${code}:${'test-pepper'}`).digest('hex');
}

describe('POST /api/v1/auth/verify-email', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://verify.test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    vi.stubEnv('EMAIL_OTP_PEPPER', 'test-pepper');
    mocks.calls.length = 0;
    mocks.script.confirmError = null;
    mocks.script.updates = [];
    mocks.script.row = {
      user_id: 'auth-uuid',
      code_hash: hashFor('a@b.com', '123456'),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      attempts: 0,
    };
  });

  it('400s a malformed body without confirming', async () => {
    const { res, seen } = capture();
    await verifyEmailHandler(postReq({ email: 'nope' }), res);
    expect(seen.status).toBe(400);
    expect(mocks.calls.some((c) => c.op === 'updateUserById')).toBe(false);
  });

  it('verifies a correct code and confirms the email authoritatively', async () => {
    const { res, seen } = capture();
    await verifyEmailHandler(postReq({ email: 'a@b.com', code: '123456' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ email: 'a@b.com' });
    expect(typeof (seen.body as { verifiedAt: string }).verifiedAt).toBe('string');
    expect(mocks.calls.find((c) => c.op === 'updateUserById')?.arg).toEqual({
      id: 'auth-uuid',
      patch: { email_confirm: true },
    });
    expect(mocks.script.updates.some((u) => 'verified_at' in u)).toBe(true);
  });

  it('400s an incorrect code, records the attempt, and never confirms', async () => {
    const { res, seen } = capture();
    await verifyEmailHandler(postReq({ email: 'a@b.com', code: '000000' }), res);
    expect(seen.status).toBe(400);
    expect(seen.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(mocks.calls.some((c) => c.op === 'updateUserById')).toBe(false);
    expect(mocks.script.updates[0]).toMatchObject({ attempts: 1 });
  });

  it('400s a locked code after too many attempts and 400s an expired code', async () => {
    mocks.script.row = { ...mocks.script.row, attempts: 5 };
    const locked = capture();
    await verifyEmailHandler(postReq({ email: 'a@b.com', code: '123456' }), locked.res);
    expect(locked.seen.status).toBe(400);
    expect(locked.seen.body).toMatchObject({ error: { message: /Too many incorrect attempts/ } });

    mocks.script.row = {
      ...mocks.script.row,
      attempts: 0,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    };
    const expired = capture();
    await verifyEmailHandler(postReq({ email: 'a@b.com', code: '123456' }), expired.res);
    expect(expired.seen.status).toBe(400);
    expect(expired.seen.body).toMatchObject({ error: { message: /expired/ } });
  });

  it('resolves a legacy row (no user_id) via the bounded auth scan', async () => {
    mocks.script.row = {
      user_id: null,
      code_hash: hashFor('legacy@b.com', '654321'),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      attempts: 0,
    };
    const { res, seen } = capture();
    await verifyEmailHandler(postReq({ email: 'legacy@b.com', code: '654321' }), res);
    expect(seen.status).toBe(200);
    expect(mocks.calls.find((c) => c.op === 'updateUserById')?.arg).toMatchObject({
      id: 'auth-legacy-uuid',
    });
  });

  it('500s when the authoritative confirm fails', async () => {
    mocks.script.confirmError = { message: 'db down' };
    const { res, seen } = capture();
    await verifyEmailHandler(postReq({ email: 'a@b.com', code: '123456' }), res);
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});
