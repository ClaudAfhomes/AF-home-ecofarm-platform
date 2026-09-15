import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import saleById from './[id].js';

/**
 * QUALIFYING_SALE delegation (commission generation): the PATCH branch must
 * call the atomic `sale_qualify` DB function (single tx: transition +
 * commissions + audit) instead of the sequential table path, and map its
 * error envelope. Other transitions keep the table path. Supabase is fully
 * mocked — SQL internals (rate math, idempotency) are covered by migration
 * review + seed backfill runs, not here.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; table?: string; arg?: unknown; fn?: string }[] = [];
  const script = {
    roleSlug: 'super_admin',
    saleRow: null as unknown,
    updatedSale: null as unknown,
    rpcResult: null as unknown,
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.in = async () => ({ data: [{ slug: script.roleSlug }], error: null });
    chain.maybeSingle = async () => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        return { data: [{ roleId: 'r-1' }], error: null };
      }
      if (table === 'Sale') return { data: script.saleRow, error: null };
      return { data: null, error: null };
    };
    chain.single = async () => {
      if (table === 'Sale') return { data: script.updatedSale, error: null };
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

const PAYMENT_VERIFIED_SALE = {
  id: 'sal-003',
  status: 'PAYMENT_VERIFIED',
  propertyId: 'igp-250-sqm-farm-lot',
  propertyName: '250 SQM Farm Lot with Hotspring',
  propertyValue: '1200000.00',
  customerId: 'cust-001',
  customerName: 'Ramon Reyes',
  sellerId: 'mem-uuid-1',
  sellerName: 'Juan Dela Cruz',
  submittedAt: '2026-08-16T09:00:00.000Z',
  approvedAt: '2026-08-17T09:00:00.000Z',
  paymentVerifiedAt: '2026-08-18T09:00:00.000Z',
  resubmissionCount: 0,
};

const QUALIFIED_SALE = { ...PAYMENT_VERIFIED_SALE, status: 'QUALIFYING_SALE' };

const patchReq = (body: unknown): VercelRequest =>
  ({ method: 'PATCH', query: { id: 'sal-003' }, headers: authed, body }) as VercelRequest;

describe('PATCH /admin/sales/:id QUALIFYING_SALE delegation', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.setRoleSlug('super_admin');
    mocks.script.saleRow = PAYMENT_VERIFIED_SALE;
    mocks.script.updatedSale = null;
    mocks.script.rpcResult = { sale: QUALIFIED_SALE };
  });

  it('delegates to sale_qualify with actor + field edits and returns the sale', async () => {
    const { res, seen } = capture();
    await saleById(patchReq({ status: 'QUALIFYING_SALE' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'sal-003', status: 'QUALIFYING_SALE' });
    const rpcCall = mocks.calls.find((c) => c.op === 'rpc');
    expect(rpcCall?.fn).toBe('sale_qualify');
    expect(rpcCall?.arg).toMatchObject({ p_id: 'sal-003', p_role: 'super_admin' });
    // No sequential table write or handler-side audit on the qualify path —
    // the function owns the whole unit.
    expect(mocks.calls.some((c) => c.op === 'update' && c.table === 'Sale')).toBe(false);
    expect(mocks.calls.some((c) => c.op === 'insert' && c.table === 'AuditLog')).toBe(false);
  });

  it('maps function CONFLICT errors to 409 without touching tables', async () => {
    mocks.script.rpcResult = {
      error: {
        code: 'CONFLICT',
        message: 'Cannot transition sale from REJECTED to QUALIFYING_SALE.',
        status: 409,
      },
    };
    const { res, seen } = capture();
    await saleById(patchReq({ status: 'QUALIFYING_SALE' }), res);
    expect(seen.status).toBe(409);
    expect(seen.body).toMatchObject({
      error: {
        code: 'CONFLICT',
        message: 'Cannot transition sale from REJECTED to QUALIFYING_SALE.',
      },
    });
  });

  it('keeps other transitions on the sequential table path (no rpc)', async () => {
    mocks.script.saleRow = { ...PAYMENT_VERIFIED_SALE, status: 'SUBMITTED' };
    mocks.script.updatedSale = { ...PAYMENT_VERIFIED_SALE, status: 'ADMIN_APPROVED' };
    const { res, seen } = capture();
    await saleById(patchReq({ status: 'ADMIN_APPROVED' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ status: 'ADMIN_APPROVED' });
    expect(mocks.calls.some((c) => c.op === 'rpc')).toBe(false);
  });
});
