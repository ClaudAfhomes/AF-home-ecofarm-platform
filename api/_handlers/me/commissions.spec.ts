import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import commissions from './commissions.js';

/**
 * GET /me/commissions (SCR-MEM-015): commissions render newest first, and a
 * commission whose sale no longer exists is dropped server-side so the UI can
 * never render a dead property link. Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const script = {
    commissions: [] as Record<string, unknown>[],
    sales: [] as { id: string; propertyName: string }[],
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = async () => {
      if (table === 'Commission') return { data: script.commissions, error: null };
      return { data: [], error: null };
    };
    chain.in = async () => {
      if (table === 'Sale') return { data: script.sales, error: null };
      return { data: [], error: null };
    };
    chain.maybeSingle = async () => ({ data: null, error: null });
    return chain;
  };
  return {
    script,
    service: { from: (table: string) => chainFor(table) },
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

const authed = { authorization: 'Bearer good' };
const getReq = (): VercelRequest =>
  ({ method: 'GET', query: {}, headers: authed }) as VercelRequest;

const COMMISSION = {
  id: 'com-001',
  commissionType: 'DIRECT_COMMISSION',
  saleId: 'sal-001',
  memberId: 'mem-uuid-1',
  baseValue: '2000000.00',
  rate: '0.0800',
  amount: '160000.00',
  status: 'AVAILABLE',
  clearedAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
};

describe('GET /me/commissions', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://commissions.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.commissions = [{ ...COMMISSION }];
    mocks.script.sales = [{ id: 'sal-001', propertyName: 'Titled Hotspring Lots' }];
  });

  it('serves own commissions with the resolved property name', async () => {
    const { res, seen } = capture();
    await commissions(getReq(), res);
    expect(seen.status).toBe(200);
    const data = (seen.body as { data: Record<string, unknown>[] }).data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ id: 'com-001', salePropertyName: 'Titled Hotspring Lots' });
  });

  it('drops commissions whose sale no longer exists (never a dead link)', async () => {
    mocks.script.commissions = [
      { ...COMMISSION },
      { ...COMMISSION, id: 'com-orphan', saleId: 'sal-gone' },
    ];
    const { res, seen } = capture();
    await commissions(getReq(), res);
    expect(seen.status).toBe(200);
    const data = (seen.body as { data: Record<string, unknown>[] }).data;
    expect(data.map((r) => r.id)).toEqual(['com-001']);
  });
});
