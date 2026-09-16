import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../_lib/http.js';

import handler from './contact.js';

/**
 * POST /contact - public Contact page submission. Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; table?: string; arg?: unknown }[] = [];
  const script = {
    count: 0,
    insertError: null as string | null,
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.gte = () => chain;
    chain.insert = (row: unknown) => {
      calls.push({ op: 'insert', table, arg: row });
      return { error: script.insertError ? new Error(script.insertError) : null };
    };
    chain.then = (resolve: (v: unknown) => void) => {
      resolve({ count: script.count, error: null });
    };
    return chain;
  };
  return {
    calls,
    script,
    service: { from: (table: string) => chainFor(table) },
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

const VALID = {
  name: 'Maria Santos',
  email: 'maria@example.com',
  message: 'I would like to know more about membership.',
};

describe('POST /contact', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://staff.test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.count = 0;
    mocks.script.insertError = null;
  });

  it('stores a valid submission and returns 201', async () => {
    const { res, seen } = capture();
    await handler(postReq(VALID), res);
    expect(seen.status).toBe(201);
    const body = seen.body as { id: string; createdAt: string };
    expect(body.id).toMatch(/^inq-/);
    expect(mocks.calls).toHaveLength(1);
    expect(mocks.calls[0]).toMatchObject({ op: 'insert', table: 'ContactInquiry' });
    const row = mocks.calls[0]!.arg as Record<string, unknown>;
    expect(row).toMatchObject({ name: 'Maria Santos', email: 'maria@example.com', status: 'NEW' });
    expect(typeof row.ipHash).toBe('string');
  });

  it('400s on invalid payload and stores nothing', async () => {
    const { res, seen } = capture();
    await handler(postReq({ name: '', email: 'nope', message: 'short' }), res);
    expect(seen.status).toBe(400);
    expect(mocks.calls).toHaveLength(0);
  });

  it('accepts the honeypot without storing', async () => {
    const { res, seen } = capture();
    await handler(postReq({ ...VALID, company: 'bot corp' }), res);
    expect(seen.status).toBe(201);
    expect(mocks.calls).toHaveLength(0);
  });

  it('429s past the per-IP throttle', async () => {
    mocks.script.count = 5;
    const { res, seen } = capture();
    await handler(postReq(VALID), res);
    expect(seen.status).toBe(429);
    expect(mocks.calls).toHaveLength(0);
  });

  it('405s non-POST methods', async () => {
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: {} } as VercelRequest, res);
    expect(seen.status).toBe(405);
  });
});
