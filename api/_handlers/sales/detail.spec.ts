import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import saleById from './[id].js';

/**
 * GET /sales/:id serves the configured commission rates alongside the
 * member's own sale so the estimate preview is config-driven (BR-CFG-001).
 * Served here (own sale only) so rates stay off the public surface.
 * Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const script = {
    saleRow: null as unknown,
    configRows: [] as { key: string; value: string }[],
  };
  const seenOr: string[] = [];
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.or = (clause: string) => {
      seenOr.push(clause);
      return chain;
    };
    chain.in = async () => {
      if (table === 'SystemConfig') return { data: script.configRows, error: null };
      return { data: [], error: null };
    };
    chain.maybeSingle = async () => {
      if (table === 'Sale') return { data: script.saleRow, error: null };
      return { data: null, error: null };
    };
    return chain;
  };
  return {
    script,
    seenOr,
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
  ({ method: 'GET', query: { id: 'sal-001' }, headers: authed }) as VercelRequest;

const SALE_ROW = {
  id: 'sal-001',
  status: 'SUBMITTED',
  propertyId: 'prisma-2storey-house',
  propertyName: '2-Storey House',
  propertyValue: '3200000.00',
  customerId: 'cus-001',
  customerName: 'Celine Cruz',
  sellerId: 'mem-uuid-1',
  sellerName: 'Juan Dela Cruz',
  submittedAt: '2026-08-18T10:00:00.000Z',
  resubmissionCount: 0,
};

describe('GET /sales/:id commission rates', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.seenOr.length = 0;
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
      id: 'sal-001',
      commissionRates: { direct: '0.0800', referral: '0.0400' },
    });
  });

  it('omits commissionRates when the rates are not configured', async () => {
    mocks.script.configRows = [];
    const { res, seen } = capture();
    await saleById(getReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'sal-001' });
    expect(seen.body).not.toHaveProperty('commissionRates');
  });
});

describe('GET /sales/:id seller-or-referrer scope', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.seenOr.length = 0;
    mocks.script.saleRow = { ...SALE_ROW, referrerId: 'mem-uuid-9' };
    mocks.script.configRows = [];
  });

  it('scopes the read to seller or selected referrer', async () => {
    const { res, seen } = capture();
    await saleById(getReq(), res);
    expect(seen.status).toBe(200);
    expect(mocks.seenOr).toHaveLength(1);
    expect(mocks.seenOr[0]).toContain('sellerId.eq.mem-uuid-1');
    expect(mocks.seenOr[0]).toContain('referrerId.eq.mem-uuid-1');
  });

  it('returns the sale to the selected referrer', async () => {
    const { res, seen } = capture();
    await saleById(getReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'sal-001', referrerId: 'mem-uuid-9' });
  });

  it('still 404s when the viewer is neither seller nor referrer', async () => {
    mocks.script.saleRow = null;
    const { res, seen } = capture();
    await saleById(getReq(), res);
    expect(seen.status).toBe(404);
    expect(seen.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
