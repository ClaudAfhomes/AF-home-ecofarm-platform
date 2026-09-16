import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import cronHandler from './commission-clearing.js';

/**
 * GET /crons/commission-clearing — unauthenticated daily trigger for the
 * atomic `commission_clear_batch` function. Safe by design (idempotent,
 * time-gated); Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; fn?: string; arg?: unknown }[] = [];
  const script = {
    rpcResult: null as unknown,
    rpcError: null as unknown,
  };
  return {
    calls,
    script,
    service: {
      rpc: async (fn: string, arg: unknown) => {
        calls.push({ op: 'rpc', fn, arg });
        return { data: script.rpcResult, error: script.rpcError };
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

const cronGet = { method: 'GET', query: {}, headers: {} } as VercelRequest;

describe('GET /crons/commission-clearing', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.rpcResult = { cleared: 1, total: '4000.00', windowDays: 7 };
    mocks.script.rpcError = null;
  });

  it('runs the batch as the system actor without staff auth', async () => {
    const { res, seen } = capture();
    await cronHandler(cronGet, res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ cleared: 1, total: '4000.00', windowDays: 7 });
    const rpcCall = mocks.calls.find((c) => c.op === 'rpc');
    expect(rpcCall?.fn).toBe('commission_clear_batch');
    expect(rpcCall?.arg).toMatchObject({ p_window_days: null, p_actor: null, p_role: 'system' });
  });

  it('405s non-GET methods', async () => {
    const { res, seen } = capture();
    await cronHandler({ method: 'POST', query: {}, headers: {} } as VercelRequest, res);
    expect(seen.status).toBe(405);
  });

  it('500s when the batch RPC fails', async () => {
    mocks.script.rpcError = { message: 'db down' };
    const { res, seen } = capture();
    await cronHandler(cronGet, res);
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});
