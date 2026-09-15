import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './withdrawals.js';

/**
 * POST /me/withdrawals now delegates the atomic reserve to the DB function
 * `withdraw_reserve`. These specs pin the API→function boundary and the
 * envelope mapping (401 gate, idempotency-key, validation, 200 replay vs 201
 * created, error mapping).
 */
const mocks = vi.hoisted(() => {
  const calls: { fn: string; arg?: unknown }[] = [];
  const script = {
    rpcResult: null as unknown,
    rpcError: null as string | null,
  };
  return {
    calls,
    script,
    service: {
      rpc: async (fn: string, arg: unknown) => {
        calls.push({ fn, arg });
        if (script.rpcError) return { data: null, error: new Error(script.rpcError) };
        return { data: script.rpcResult, error: null };
      },
    },
    anon: {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'mem-uuid-1', user_metadata: {} } },
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

const postReq = (body: unknown, idempotencyKey?: string): VercelRequest => {
  const headers: Record<string, string> = { authorization: 'Bearer good' };
  if (idempotencyKey !== undefined) headers['idempotency-key'] = idempotencyKey;
  return { method: 'POST', query: {}, headers, body } as VercelRequest;
};

const VALID_BODY = { amount: '200.00', payoutAccountId: 'pa-001' };
const WITHDRAWAL = {
  id: 'wdr-abc',
  amount: '200.00',
  status: 'RESERVED',
  payoutAccount: {
    id: 'pa-001',
    method: 'TRADITIONAL_BANK',
    accountName: 'Juan Dela Cruz',
    accountIdentifierMasked: '•••• 7890',
  },
  reservedAt: '2026-08-18T10:00:00.000Z',
  createdAt: '2026-08-18T10:00:00.000Z',
};

describe('POST /me/withdrawals (DB function boundary)', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.rpcResult = null;
    mocks.script.rpcError = null;
  });

  it('401s without credentials', async () => {
    const { res, seen } = capture();
    await handler(
      { method: 'POST', query: {}, headers: {}, body: VALID_BODY } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(401);
  });

  it('400s without an Idempotency-Key and with invalid bodies', async () => {
    const noKey = capture();
    await handler(postReq(VALID_BODY), noKey.res);
    expect(noKey.seen.status).toBe(400);

    const invalid = capture();
    await handler(postReq({ amount: 'abc', payoutAccountId: 'pa-001' }, 'k1'), invalid.res);
    expect(invalid.seen.status).toBe(400);
  });

  it('201s a fresh reservation', async () => {
    mocks.script.rpcResult = { created: true, withdrawal: WITHDRAWAL };
    const { res, seen } = capture();
    await handler(postReq(VALID_BODY, 'k2'), res);
    expect(seen.status).toBe(201);
    expect(seen.body).toEqual(WITHDRAWAL);
    expect(mocks.calls[0]).toMatchObject({ fn: 'withdraw_reserve', arg: { p_amount: '200.00' } });
  });

  it('200s an idempotent replay without side effects', async () => {
    mocks.script.rpcResult = { created: false, withdrawal: WITHDRAWAL };
    const { res, seen } = capture();
    await handler(postReq(VALID_BODY, 'k3'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual(WITHDRAWAL);
  });

  it('maps domain errors to envelopes with their status codes', async () => {
    mocks.script.rpcResult = {
      error: {
        code: 'INSUFFICIENT_BALANCE',
        message: 'The withdrawal amount exceeds your Available Balance.',
        status: 409,
      },
    };
    const { res, seen } = capture();
    await handler(postReq(VALID_BODY, 'k4'), res);
    expect(seen.status).toBe(409);
    expect(seen.body).toMatchObject({ error: { code: 'INSUFFICIENT_BALANCE' } });
  });

  it('maps configured-limit errors from the DB function', async () => {
    mocks.script.rpcResult = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The withdrawal amount is below the minimum of 100.00.',
        status: 400,
      },
    };
    const { res, seen } = capture();
    await handler(postReq({ amount: '50.00', payoutAccountId: 'pa-001' }, 'k6'), res);
    expect(seen.status).toBe(400);
    expect(seen.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('500s transport-level rpc failures', async () => {
    mocks.script.rpcError = 'connection refused';
    const { res, seen } = capture();
    await handler(postReq(VALID_BODY, 'k5'), res);
    expect(seen.status).toBe(500);
  });
});
