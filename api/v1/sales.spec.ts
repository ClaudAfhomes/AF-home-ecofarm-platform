import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../_lib/http.js';

import handler from './sales.js';

/**
 * GET own sales / POST submit (Idempotency-Key, qualified-only). These specs
 * pin the referrer-name snapshot (chosen from direct referrals or typed
 * free-form): the POST persists it when supplied, omits it otherwise, and the
 * GET round-trips it. Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    member: null as unknown,
    customer: null as unknown,
    catalog: null as unknown,
    replay: null as unknown,
    sales: [] as Record<string, unknown>[],
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = async () => {
      if (table === 'Sale') return { data: script.sales, error: null };
      return { data: [], error: null };
    };
    chain.maybeSingle = async () => {
      if (table === 'Member') return { data: script.member, error: null };
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

  it('persists an optional referrer name snapshot on submit', async () => {
    const { res, seen } = capture();
    await handler(
      postReq({ customerId: 'cus-1', propertyId: 'prop-1', referrerName: 'Maria Santos' }, 'k2'),
      res,
    );
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({ referrerName: 'Maria Santos' });
    const insert = mocks.calls.find((c) => c.table === 'Sale')?.arg as Record<string, unknown>;
    expect(insert.referrerName).toBe('Maria Santos');
  });

  it('omits referrerName when not supplied', async () => {
    const { res, seen } = capture();
    await handler(postReq({ customerId: 'cus-1', propertyId: 'prop-1' }, 'k3'), res);
    expect(seen.status).toBe(201);
    const insert = mocks.calls.find((c) => c.table === 'Sale')?.arg as Record<string, unknown>;
    expect(insert).not.toHaveProperty('referrerName');
    expect(seen.body).not.toHaveProperty('referrerName');
  });

  it('GET round-trips the referrer name snapshot', async () => {
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
        referrerName: 'Maria Santos',
      },
    ];
    const { res, seen } = capture();
    await handler(getReq(), res);
    expect(seen.status).toBe(200);
    const data = (seen.body as { data: Record<string, unknown>[] }).data;
    expect(data[0]).toMatchObject({ referrerName: 'Maria Santos' });
  });
});
