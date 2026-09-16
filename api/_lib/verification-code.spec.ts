import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CODE_MAX_ATTEMPTS,
  checkVerificationCode,
  generateCode,
  issueVerificationCode,
} from './verification-code.js';

/**
 * Self-managed verification codes. The Supabase client is a chainable mock;
 * EmailJS delivery is mocked at the fetch boundary.
 */
const mocks = vi.hoisted(() => {
  const script = {
    row: null as Record<string, unknown> | null,
    upserted: null as Record<string, unknown> | null,
    updates: [] as Record<string, unknown>[],
    authUsers: [{ id: 'auth-uuid-1', email: 'maria@example.com' }],
  };
  const chain = () => {
    const c: Record<string, (...a: never[]) => unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data: script.row, error: null });
    c.upsert = async (row: Record<string, unknown>) => {
      script.upserted = row;
      script.row = row;
      return { error: null };
    };
    c.update = (patch: Record<string, unknown>) => {
      script.updates.push(patch);
      return { eq: async () => ({ error: null }) };
    };
    return c;
  };
  return {
    script,
    service: {
      from: () => chain(),
      auth: {
        admin: {
          listUsers: async () => ({ data: { users: script.authUsers }, error: null }),
        },
      },
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => mocks.service }));

describe('verification-code', () => {
  beforeEach(() => {
    vi.stubEnv('EMAIL_OTP_PEPPER', 'test-pepper');
    mocks.script.row = null;
    mocks.script.upserted = null;
    mocks.script.updates = [];
    mocks.script.authUsers = [{ id: 'auth-uuid-1', email: 'maria@example.com' }];
  });

  it('generates a 6-digit code', () => {
    for (let i = 0; i < 20; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it('issues a hashed code and emails it', async () => {
    const fetchMock = vi.fn(async () => new Response('OK', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('EMAILJS_SERVICE_ID', 'service_test');
    vi.stubEnv('EMAILJS_TEMPLATE_ID', 'template_test');
    vi.stubEnv('EMAILJS_PUBLIC_KEY', 'public_test');

    const result = await issueVerificationCode(mocks.service as never, {
      email: 'Maria@Example.com',
      userId: 'auth-uuid-1',
    });
    expect(result.sent).toBe(true);
    expect(mocks.script.upserted).toMatchObject({
      email: 'maria@example.com',
      user_id: 'auth-uuid-1',
      attempts: 0,
    });
    expect(String(mocks.script.upserted!.code_hash)).not.toContain('123456');
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.template_params.verification_code).toMatch(/^\d{6}$/);
  });

  it('respects the resend cooldown on a live code', async () => {
    const fetchMock = vi.fn(async () => new Response('OK', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    mocks.script.row = {
      email: 'maria@example.com',
      code_hash: 'x',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      sent_at: new Date(Date.now() - 10_000).toISOString(),
      attempts: 0,
      send_count: 1,
      window_start: new Date().toISOString(),
    };
    const result = await issueVerificationCode(mocks.service as never, {
      email: 'maria@example.com',
    });
    expect(result.sent).toBe(true);
    expect(result.cooldownSeconds).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate-limits past the hourly send cap', async () => {
    mocks.script.row = {
      email: 'maria@example.com',
      code_hash: 'x',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      sent_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      attempts: 0,
      send_count: 5,
      window_start: new Date(Date.now() - 30 * 60_000).toISOString(),
    };
    const result = await issueVerificationCode(mocks.service as never, {
      email: 'maria@example.com',
    });
    expect(result).toMatchObject({ sent: false, rateLimited: true });
  });

  it('verifies a correct code and marks the row verified', async () => {
    const { createHash } = await import('node:crypto');
    const code = '246810';
    const hash = createHash('sha256').update(`maria@example.com:${code}:test-pepper`).digest('hex');
    mocks.script.row = {
      email: 'maria@example.com',
      code_hash: hash,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      attempts: 0,
    };
    const result = await checkVerificationCode(mocks.service as never, 'maria@example.com', code);
    expect(result.ok).toBe(true);
    expect(mocks.script.updates.some((u) => 'verified_at' in u)).toBe(true);
  });

  it('rejects a wrong code, counts the attempt, and locks at the max', async () => {
    mocks.script.row = {
      email: 'maria@example.com',
      code_hash: 'deadbeef',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      attempts: 0,
    };
    const wrong = await checkVerificationCode(
      mocks.service as never,
      'maria@example.com',
      '000000',
    );
    expect(wrong).toEqual({ ok: false, reason: 'invalid' });
    expect(mocks.script.updates[0]).toMatchObject({ attempts: 1 });

    mocks.script.updates = [];
    mocks.script.row = { ...mocks.script.row, attempts: CODE_MAX_ATTEMPTS };
    const locked = await checkVerificationCode(
      mocks.service as never,
      'maria@example.com',
      '000000',
    );
    expect(locked).toEqual({ ok: false, reason: 'locked' });
  });

  it('reports missing and expired codes', async () => {
    expect(await checkVerificationCode(mocks.service as never, 'a@b.co', '111111')).toEqual({
      ok: false,
      reason: 'missing',
    });
    mocks.script.row = {
      email: 'a@b.co',
      code_hash: 'x',
      expires_at: new Date(Date.now() - 1000).toISOString(),
      attempts: 0,
    };
    expect(await checkVerificationCode(mocks.service as never, 'a@b.co', '111111')).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
});
