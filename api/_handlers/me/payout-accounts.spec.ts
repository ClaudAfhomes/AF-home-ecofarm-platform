import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import listAdminPayouts from '../admin/payouts.js';
import reviewAdminPayout from '../admin/payouts/[id].js';
import memberPayoutAccounts from './payout-accounts.js';

/**
 * Payout unification (owner decision D2): member submissions and the admin
 * queue share one PayoutAccount table. A member-created row must be visible
 * to admin review, and an admin decision must reflect back to the member.
 * Supabase is fully mocked; the table name asserted is the contract.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; table?: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'finance',
    payoutRows: [] as Record<string, unknown>[],
    payoutRow: null as unknown,
    updatedPayout: null as unknown,
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = async () => ({ data: script.payoutRows, error: null });
    chain.in = async () => {
      if (table === 'Role') return { data: [{ slug: script.roleSlug }], error: null };
      return { data: [], error: null };
    };
    chain.maybeSingle = async () => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        return { data: [{ roleId: 'r-1' }], error: null };
      }
      if (table === 'PayoutAccount') return { data: script.payoutRow, error: null };
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

const memberHeaders = { authorization: 'Bearer member-good' };
const staffHeaders = { authorization: 'Bearer staff-good' };

const MEMBER_ROW = {
  id: 'pa-009',
  memberId: 'mem-uuid-1',
  method: 'GCASH',
  accountName: 'Juan Dela Cruz',
  accountIdentifier: '09175550199',
  status: 'PENDING',
  isPrimary: false,
  createdAt: '2026-09-01T00:00:00.000Z',
};

describe('payout unification', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://unified.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.payoutRows = [];
    mocks.script.payoutRow = null;
    mocks.script.updatedPayout = null;
  });

  it('member submissions land in the unified PayoutAccount table, raw stored, masked served', async () => {
    const { res, seen } = capture();
    await memberPayoutAccounts(
      {
        method: 'POST',
        query: {},
        headers: memberHeaders,
        body: { method: 'GCASH', accountName: 'Juan Dela Cruz', accountIdentifier: '09175550199' },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(201);
    const insert = mocks.calls.find((c) => c.op === 'insert');
    expect(insert?.table).toBe('PayoutAccount');
    expect(insert?.arg).toMatchObject({ memberId: 'mem-uuid-1', accountIdentifier: '09175550199' });
    expect(seen.body).toMatchObject({
      accountIdentifierMasked: '•••• 0199',
      accountIdentifier: '09175550199',
    });
  });

  it('admin review lists member-owned rows', async () => {
    mocks.script.payoutRows = [MEMBER_ROW];
    const { res, seen } = capture();
    await listAdminPayouts(
      { method: 'GET', query: {}, headers: staffHeaders } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const body = seen.body as { data: { id: string }[] };
    expect(body.data.map((r) => r.id)).toContain('pa-009');
  });

  it('admin approval on a member row reflects back to the member', async () => {
    mocks.script.payoutRow = MEMBER_ROW;
    mocks.script.updatedPayout = { ...MEMBER_ROW, status: 'CONFIRMED' };
    const review = capture();
    await reviewAdminPayout(
      {
        method: 'PATCH',
        query: { id: 'pa-009' },
        headers: staffHeaders,
        body: { status: 'CONFIRMED' },
      } as VercelRequest,
      review.res,
    );
    expect(review.seen.status).toBe(200);
    expect(review.seen.body).toMatchObject({ id: 'pa-009', status: 'CONFIRMED' });

    mocks.script.payoutRows = [{ ...MEMBER_ROW, status: 'CONFIRMED' }];
    const list = capture();
    await memberPayoutAccounts(
      { method: 'GET', query: {}, headers: memberHeaders } as VercelRequest,
      list.res,
    );
    expect(list.seen.status).toBe(200);
    const listBody = list.seen.body as { data: { status: string }[] };
    expect(listBody.data[0]?.status).toBe('CONFIRMED');
  });
});
