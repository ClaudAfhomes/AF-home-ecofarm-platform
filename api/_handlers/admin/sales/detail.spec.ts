import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import saleById from './[id].js';

/**
 * GET /admin/sales/:id serves the configured commission rates alongside the
 * sale so the estimate preview is config-driven (BR-CFG-001), never
 * hard-coded. Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const rpcCalls: { fn: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    saleRow: null as unknown,
    configRows: [] as { key: string; value: string }[],
    rpcResult: null as unknown,
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.in = async () => {
      if (table === 'SystemConfig') return { data: script.configRows, error: null };
      return { data: [{ slug: script.roleSlug }], error: null };
    };
    chain.maybeSingle = async () => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        return { data: [{ roleId: 'r-1' }], error: null };
      }
      if (table === 'Sale') return { data: script.saleRow, error: null };
      return { data: null, error: null };
    };
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-1' }], error: null });
      } else resolve({ data: null, error: null });
    };
    return chain;
  };
  return {
    script,
    rpcCalls,
    service: {
      from: (table: string) => chainFor(table),
      rpc: async (fn: string, arg: unknown) => {
        rpcCalls.push({ fn, arg });
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
const getReq = (): VercelRequest =>
  ({ method: 'GET', query: { id: 'sal-003' }, headers: authed }) as VercelRequest;

const SALE_ROW = {
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

describe('GET /admin/sales/:id commission rates', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.roleSlug = 'super_admin';
    mocks.script.saleRow = SALE_ROW;
    mocks.script.configRows = [
      { key: 'COMMISSION_DIRECT_RATE', value: '0.0800' },
      { key: 'COMMISSION_REFERRAL_RATE', value: '0.0400' },
    ];
  });

  it('serves the sale with the configured commission rates', async () => {
    const { res, seen } = capture();
    await saleById(getReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      id: 'sal-003',
      commissionRates: { direct: '0.0800', referral: '0.0400' },
    });
  });

  it('omits commissionRates when the rates are not configured', async () => {
    mocks.script.configRows = [];
    const { res, seen } = capture();
    await saleById(getReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'sal-003' });
    expect(seen.body).not.toHaveProperty('commissionRates');
  });
});

describe('DELETE /admin/sales/:id sale_delete guard', () => {
  const deleteReq = (): VercelRequest =>
    ({ method: 'DELETE', query: { id: 'sal-003' }, headers: authed }) as VercelRequest;

  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.rpcCalls.length = 0;
    mocks.script.roleSlug = 'super_admin';
    mocks.script.saleRow = SALE_ROW;
  });

  it('delegates deletion to the atomic sale_delete function', async () => {
    mocks.script.rpcResult = { deleted: true, id: 'sal-003', commissionsRemoved: 0 };
    const { res, seen } = capture();
    await saleById(deleteReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'sal-003', deleted: true });
    expect(mocks.rpcCalls).toHaveLength(1);
    expect(mocks.rpcCalls[0]?.fn).toBe('sale_delete');
    expect(mocks.rpcCalls[0]?.arg).toMatchObject({ p_id: 'sal-003' });
  });

  it('surfaces the credited-commission block as 409', async () => {
    mocks.script.rpcResult = {
      error: {
        code: 'CONFLICT',
        message: 'This sale has credited commissions and cannot be deleted.',
        status: 409,
      },
    };
    const { res, seen } = capture();
    await saleById(deleteReq(), res);
    expect(seen.status).toBe(409);
    expect(seen.body).toMatchObject({
      error: {
        code: 'CONFLICT',
        message: 'This sale has credited commissions and cannot be deleted.',
      },
    });
  });
});
