import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import clearDueHandler from './clear-due.js';

/**
 * POST /admin/commissions/clear-due — staff-triggered run of the atomic
 * `commission_clear_batch` function (single tx per commission: AVAILABLE +
 * ledger + wallet). Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; fn?: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    rpcResult: null as unknown,
    rpcError: null as unknown,
  };
  const chain: Record<string, (...a: never[]) => unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = async () => ({ data: [{ slug: script.roleSlug }], error: null });
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.then = (resolve: (v: unknown) => void) => {
    resolve({ data: [{ roleId: 'r-1' }], error: null });
  };
  return {
    calls,
    script,
    service: {
      from: () => chain,
      rpc: async (fn: string, arg: unknown) => {
        calls.push({ op: 'rpc', fn, arg });
        return { data: script.rpcResult, error: script.rpcError };
      },
    },
    anon: {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'staff-uuid-1', user_metadata: {} } },
          error: null,
        }),
      },
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => (key === 'service' ? mocks.service : mocks.anon),
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

const authedPost = {
  method: 'POST',
  query: {},
  headers: { authorization: 'Bearer good' },
} as VercelRequest;

describe('POST /admin/commissions/clear-due', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'super_admin';
    mocks.script.rpcResult = { cleared: 2, total: '8400.00', windowDays: 7 };
    mocks.script.rpcError = null;
  });

  it('runs the clearing batch and returns the validated result', async () => {
    const { res, seen } = capture();
    await clearDueHandler(authedPost, res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ cleared: 2, total: '8400.00', windowDays: 7 });
    const rpcCall = mocks.calls.find((c) => c.op === 'rpc');
    expect(rpcCall?.fn).toBe('commission_clear_batch');
    expect(rpcCall?.arg).toMatchObject({ p_window_days: null, p_actor: 'staff-uuid-1' });
  });

  it('rejects non-finance staff', async () => {
    mocks.script.roleSlug = 'support';
    const { res, seen } = capture();
    await clearDueHandler(authedPost, res);
    expect(seen.status).toBe(403);
  });

  it('500s when the batch RPC fails', async () => {
    mocks.script.rpcError = { message: 'db down' };
    const { res, seen } = capture();
    await clearDueHandler(authedPost, res);
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});
