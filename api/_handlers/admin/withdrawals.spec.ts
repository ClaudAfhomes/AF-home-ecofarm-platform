import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import completeWithdrawal from './withdrawals/[id]/complete.js';
import rejectWithdrawal from './withdrawals/[id]/reject.js';
import reviewPayout from './payouts/[id].js';

/**
 * Admin finance transitions (Phase 3A): complete/reject now delegate to the
 * atomic DB functions `withdrawal_complete` / `withdrawal_reject`; payout
 * review still uses table writes. Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; table?: string; arg?: unknown; fn?: string }[] = [];
  const script = {
    roleSlug: 'super_admin',
    withdrawalRow: null as unknown,
    rpcResult: null as unknown,
    payout: null as unknown,
    updatedPayout: null as unknown,
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.in = async (key: string) => {
      if (table === 'Role' && key === 'id')
        return { data: [{ slug: script.roleSlug }], error: null };
      if (table === 'Role') return { data: [{ slug: script.roleSlug }], error: null };
      return { data: [], error: null };
    };
    chain.maybeSingle = async () => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        return { data: [{ roleId: 'r-1' }], error: null };
      }
      if (table === 'Withdrawal') return { data: script.withdrawalRow, error: null };
      if (table === 'PayoutAccount') return { data: script.payout, error: null };
      return { data: null, error: null };
    };
    chain.single = async () => {
      if (table === 'PayoutAccount') return { data: script.updatedPayout, error: null };
      return { data: null, error: null };
    };
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-1' }], error: null });
      } else resolve({ data: null, error: null });
    };
    return {
      ...chain,
      insert: async (row: unknown) => {
        calls.push({ op: 'insert', table, arg: row });
        return { error: null };
      },
      update: (patch: unknown) => {
        calls.push({ op: 'update', table, arg: patch });
        return { eq: () => ({ select: () => ({ single: chain.single }) }) };
      },
    };
  };
  return {
    calls,
    script,
    setRoleSlug: (slug: string) => {
      script.roleSlug = slug;
    },
    service: {
      from: (table: string) => chainFor(table),
      rpc: async (fn: string, arg: unknown) => {
        calls.push({ op: 'rpc', fn, arg });
        return { data: script.rpcResult, error: null };
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

const authed = { authorization: 'Bearer good' };

const COMPLETED_ROW = {
  id: 'wdr-003',
  memberId: 'mem-uuid-1',
  payoutAccountId: 'pa-001',
  accountMethod: 'TRADITIONAL_BANK',
  accountName: 'Juan Dela Cruz',
  accountIdentifierMasked: '•••• 7890',
  amount: '75000.00',
  status: 'COMPLETED',
  reservedAt: '2026-08-16T09:00:00.000Z',
  completedAt: '2026-08-18T11:00:00.000Z',
  createdAt: '2026-08-15T16:00:00.000Z',
};

describe('POST /admin/withdrawals/:id/complete (DB function)', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.setRoleSlug('finance');
    mocks.script.withdrawalRow = COMPLETED_ROW;
    mocks.script.rpcResult = {
      status: 'COMPLETED',
      completedAt: COMPLETED_ROW.completedAt,
      amount: '75000.00',
    };
  });

  it('403s merchant and 409s via mapped function errors', async () => {
    mocks.setRoleSlug('merchant');
    const forbidden = capture();
    await completeWithdrawal(
      { method: 'POST', query: { id: 'wdr-003' }, headers: authed, body: {} } as VercelRequest,
      forbidden.res,
    );
    expect(forbidden.seen.status).toBe(403);

    mocks.setRoleSlug('finance');
    mocks.script.rpcResult = {
      error: {
        code: 'CONFLICT',
        message: 'Only reserved withdrawals can be completed (current: COMPLETED).',
        status: 409,
      },
    };
    const conflict = capture();
    await completeWithdrawal(
      { method: 'POST', query: { id: 'wdr-003' }, headers: authed, body: {} } as VercelRequest,
      conflict.res,
    );
    expect(conflict.seen.status).toBe(409);
  });

  it('delegates to withdrawal_complete and returns the stored row', async () => {
    const { res, seen } = capture();
    await completeWithdrawal(
      { method: 'POST', query: { id: 'wdr-003' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'wdr-003', status: 'COMPLETED' });
    const rpcCall = mocks.calls.find((c) => c.op === 'rpc')?.arg as Record<string, unknown>;
    expect(rpcCall).toMatchObject({ p_id: 'wdr-003', p_role: 'finance' });
  });
});

describe('POST /admin/withdrawals/:id/reject (DB function)', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.setRoleSlug('finance');
    mocks.script.withdrawalRow = {
      ...COMPLETED_ROW,
      status: 'REJECTED',
      rejectedAt: '2026-08-18T11:00:00.000Z',
      rejectionReason: 'Duplicate request',
    };
    mocks.script.rpcResult = {
      status: 'REJECTED',
      rejectedAt: '2026-08-18T11:00:00.000Z',
      amount: '75000.00',
    };
  });

  it('maps a missing-reason function error to 400 and success to the stored row', async () => {
    mocks.script.rpcResult = {
      error: { code: 'VALIDATION_ERROR', message: 'Rejection reason is required.', status: 400 },
    };
    const invalid = capture();
    await rejectWithdrawal(
      { method: 'POST', query: { id: 'wdr-003' }, headers: authed, body: {} } as VercelRequest,
      invalid.res,
    );
    expect(invalid.seen.status).toBe(400);

    mocks.script.rpcResult = { status: 'REJECTED' };
    const ok = capture();
    await rejectWithdrawal(
      {
        method: 'POST',
        query: { id: 'wdr-003' },
        headers: authed,
        body: { rejectionReason: 'Duplicate request' },
      } as VercelRequest,
      ok.res,
    );
    expect(ok.seen.status).toBe(200);
    expect(ok.seen.body).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Duplicate request',
    });
    const rpcCalls = mocks.calls.filter((c) => c.op === 'rpc');
    expect(rpcCalls[rpcCalls.length - 1]?.arg as Record<string, unknown>).toMatchObject({
      p_reason: 'Duplicate request',
      p_role: 'finance',
    });
  });
});

describe('PATCH /admin/payouts/:id', () => {
  const PENDING_PAYOUT = {
    id: 'pac-001',
    method: 'TRADITIONAL_BANK',
    accountName: 'Juan Dela Cruz',
    accountIdentifierMasked: '09171234567',
    status: 'PENDING',
    isPrimary: false,
    createdAt: '2026-08-15T10:00:00.000Z',
  };

  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.setRoleSlug('finance');
    mocks.script.payout = PENDING_PAYOUT;
    mocks.script.updatedPayout = { ...PENDING_PAYOUT, status: 'CONFIRMED' };
  });

  const patchReq = (body: unknown): VercelRequest =>
    ({ method: 'PATCH', query: { id: 'pac-001' }, headers: authed, body }) as VercelRequest;

  it('403s merchant and 409s already-reviewed accounts', async () => {
    mocks.setRoleSlug('merchant');
    const forbidden = capture();
    await reviewPayout(patchReq({ status: 'CONFIRMED' }), forbidden.res);
    expect(forbidden.seen.status).toBe(403);

    mocks.setRoleSlug('finance');
    mocks.script.payout = { ...PENDING_PAYOUT, status: 'CONFIRMED' };
    const conflict = capture();
    await reviewPayout(patchReq({ status: 'CONFIRMED' }), conflict.res);
    expect(conflict.seen.status).toBe(409);
  });

  it('approves with an audit entry', async () => {
    const { res, seen } = capture();
    await reviewPayout(patchReq({ status: 'CONFIRMED' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'pac-001', status: 'CONFIRMED' });
    const audit = mocks.calls.find((c) => c.op === 'insert' && c.table === 'AuditLog')
      ?.arg as Record<string, unknown>;
    expect(audit).toMatchObject({ action: 'PAYOUT_CONFIRMED', target_id: 'pac-001' });
  });
});
