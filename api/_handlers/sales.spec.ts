import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../_lib/http.js';

import handler from './sales.js';

/**
 * GET own sales / POST submit (Idempotency-Key, qualified-only). These specs
 * pin the referrerId (members only): the POST persists it when the referrer
 * is a direct referral, rejects otherwise, and the GET round-trips it.
 * Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    member: null as unknown,
    referrer: null as unknown,
    customer: null as unknown,
    catalog: null as unknown,
    replay: null as unknown,
    sales: [] as Record<string, unknown>[],
  };
  const chainFor = (table: string) => {
    const lastEq: Record<string, unknown> = {};
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, val: unknown) => {
      lastEq[col] = val;
      return chain;
    };
    chain.order = async () => {
      if (table === 'Sale') return { data: script.sales, error: null };
      return { data: [], error: null };
    };
    chain.maybeSingle = async () => {
      if (table === 'Member') {
        // Referrer lookup (id = referrerId) vs seller lookup (id = sellerId).
        if (lastEq.id && script.referrer && (script.referrer as { id?: string }).id === lastEq.id) {
          return { data: script.referrer, error: null };
        }
        return { data: script.member, error: null };
      }
      if (table === 'Customer') return { data: script.customer, error: null };
      if (table === 'cms_contents') return { data: { content: script.catalog }, error: null };
      if (table === 'IdempotencyKey') return { data: script.replay, error: null };
      return { data: null, error: null };
    };
    chain.delete = () => chain;
    return {
      ...chain,
      insert: async (row: unknown) => {
        calls.push({ table, op: 'insert', arg: row });
        return { error: null };
      },
      upsert: async (row: unknown) => {
        calls.push({ table, op: 'upsert', arg: row });
        return { error: null };
      },
    };
  };
  return {
    calls,
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
const postReq = (body: unknown, idempotencyKey?: string): VercelRequest => {
  const headers: Record<string, string> = { authorization: 'Bearer good' };
  if (idempotencyKey !== undefined) headers['idempotency-key'] = idempotencyKey;
  return { method: 'POST', query: {}, headers, body } as VercelRequest;
};
const getReq = (): VercelRequest =>
  ({ method: 'GET', query: {}, headers: authed }) as VercelRequest;

const QUALIFIED_MEMBER = {
  id: 'mem-uuid-1',
  isQualified: true,
  accountStatus: 'ACTIVE',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  name: null,
};

const CATALOG = {
  properties: [{ id: 'prop-1', name: '250 SQM Farm Lot with Hotspring', price: '1200000.00' }],
};

const CUSTOMER = { id: 'cus-1', name: 'Ramon Reyes' };

describe('POST /sales referrer snapshot', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://sales.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.member = QUALIFIED_MEMBER;
    mocks.script.referrer = null;
    mocks.script.customer = CUSTOMER;
    mocks.script.catalog = CATALOG;
    mocks.script.replay = null;
    mocks.script.sales = [];
  });

  it('401s without credentials', async () => {
    const { res, seen } = capture();
    await handler({ method: 'POST', query: {}, headers: {}, body: {} } as VercelRequest, res);
    expect(seen.status).toBe(401);
  });

  it('422s a non-qualified member', async () => {
    mocks.script.member = { ...QUALIFIED_MEMBER, isQualified: false };
    const { res, seen } = capture();
    await handler(postReq({ customerId: 'cus-1', propertyId: 'prop-1' }, 'k1'), res);
    expect(seen.status).toBe(422);
  });

  it('400s without an Idempotency-Key', async () => {
    const { res, seen } = capture();
    await handler(postReq({ customerId: 'cus-1', propertyId: 'prop-1' }), res);
    expect(seen.status).toBe(400);
  });

  it('persists an optional referrerId snapshot on submit', async () => {
    mocks.script.referrer = {
      id: 'mem-ref-1',
      firstName: 'Maria',
      lastName: 'Santos',
      name: 'Maria Santos',
      sponsorId: 'mem-uuid-1',
    };
    const { res, seen } = capture();
    await handler(
      postReq({ customerId: 'cus-1', propertyId: 'prop-1', referrerId: 'mem-ref-1' }, 'k2'),
      res,
    );
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({ referrerId: 'mem-ref-1', referrerName: 'Maria Santos' });
    const insert = mocks.calls.find((c) => c.table === 'Sale')?.arg as Record<string, unknown>;
    expect(insert.referrerId).toBe('mem-ref-1');
    expect(insert.referrerName).toBe('Maria Santos');
  });

  it('rejects a non-direct referrer', async () => {
    mocks.script.referrer = {
      id: 'mem-ref-1',
      firstName: 'Maria',
      lastName: 'Santos',
      sponsorId: 'someone-else',
    };
    const { res, seen } = capture();
    await handler(
      postReq({ customerId: 'cus-1', propertyId: 'prop-1', referrerId: 'mem-ref-1' }, 'k2b'),
      res,
    );
    expect(seen.status).toBe(400);
  });

  it('omits referrer when not supplied', async () => {
    const { res, seen } = capture();
    await handler(postReq({ customerId: 'cus-1', propertyId: 'prop-1' }, 'k3'), res);
    expect(seen.status).toBe(201);
    const insert = mocks.calls.find((c) => c.table === 'Sale')?.arg as Record<string, unknown>;
    expect(insert).not.toHaveProperty('referrerId');
    expect(insert).not.toHaveProperty('referrerName');
    expect(seen.body).not.toHaveProperty('referrerId');
  });

  it('GET round-trips the referrer snapshot', async () => {
    mocks.script.sales = [
      {
        id: 'sal-1',
        status: 'SUBMITTED',
        propertyId: 'prop-1',
        propertyName: '250 SQM Farm Lot with Hotspring',
        propertyValue: '1200000.00',
        customerId: 'cus-1',
        customerName: 'Ramon Reyes',
        sellerId: 'mem-uuid-1',
        sellerName: 'Juan Dela Cruz',
        submittedAt: '2026-08-18T09:00:00.000Z',
        resubmissionCount: 0,
        referrerId: 'mem-ref-1',
        referrerName: 'Maria Santos',
      },
    ];
    const { res, seen } = capture();
    await handler(getReq(), res);
    expect(seen.status).toBe(200);
    const data = (seen.body as { data: Record<string, unknown>[] }).data;
    expect(data[0]).toMatchObject({ referrerId: 'mem-ref-1', referrerName: 'Maria Santos' });
  });
});
