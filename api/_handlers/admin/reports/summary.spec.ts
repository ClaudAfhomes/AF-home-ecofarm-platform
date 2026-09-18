import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import summaryHandler from './summary.js';

/**
 * GET /admin/reports/summary - Supabase fully mocked with per-table result
 * queues: auth consumes StaffUser/StaffAssignment/Role, the report reads
 * Member (3 count calls), Registration (3), Sale (rows), Withdrawal
 * (rows), Commission (rows), ContactInquiry (count).
 */
const script = {
  roleSlug: 'super_admin',
  saleRows: [] as Record<string, unknown>[],
  saleError: null as { message: string } | null,
  withdrawalRows: [] as Record<string, unknown>[],
  withdrawalError: null as { message: string } | null,
  commissionRows: [] as Record<string, unknown>[],
  commissionError: null as { message: string } | null,
};

const tableResults = new Map<string, unknown[]>();

function chainFor(table: string) {
  const next = () => {
    const queue = tableResults.get(table) ?? [];
    const [first, ...rest] = queue;
    tableResults.set(table, rest);
    return (
      (first as { data?: unknown; error?: unknown; count?: number } | undefined) ?? {
        data: [],
        error: null,
      }
    );
  };
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'is', 'not', 'neq', 'eq', 'order', 'range', 'limit', 'in']) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.insert = async () => ({ error: null });
  chain.then = (resolve: (value: unknown) => void) => resolve(next());
  return chain;
}

const mocks = vi.hoisted(() => {
  return {
    service: {
      from: (table: string) => chainFor(table),
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

const authedGet = {
  method: 'GET',
  query: {},
  headers: { authorization: 'Bearer good' },
} as unknown as VercelRequest;

function seedDefault() {
  tableResults.set('StaffUser', [{ data: null, error: null }]);
  tableResults.set('StaffAssignment', [{ data: [{ roleId: 'role-1' }], error: null }]);
  tableResults.set('Role', [{ data: [{ slug: script.roleSlug }], error: null }]);
  // Promise.all call order: Member x3 (active, inactive, archived),
  // Registration x3 (total, pending, rejected), Sale, Withdrawal,
  // Commission, ContactInquiry.
  tableResults.set('Member', [
    { data: [], error: null, count: 4 },
    { data: [], error: null, count: 1 },
    { data: [], error: null, count: 2 },
  ]);
  tableResults.set('Registration', [
    { data: [], error: null, count: 6 },
    { data: [], error: null, count: 1 },
    { data: [], error: null, count: 1 },
  ]);
  tableResults.set('Sale', [
    {
      data: [
        { status: 'SUBMITTED' },
        { status: 'PAYMENT_VERIFIED' },
        { status: 'PAYMENT_VERIFIED' },
      ],
      error: null,
    },
  ]);
  tableResults.set('Withdrawal', [
    {
      data: [
        { amount: '50000.00', status: 'COMPLETED' },
        { amount: '12000.00', status: 'REQUESTED' },
        { amount: '3000.00', status: 'RESERVED' },
        { amount: '500.00', status: 'REJECTED' },
      ],
      error: null,
    },
  ]);
  tableResults.set('Commission', [
    {
      data: [
        { amount: '96000.00', status: 'AVAILABLE' },
        { amount: '4000.00', status: 'PENDING' },
        { amount: '1000.00', status: 'REVERSED' },
      ],
      error: null,
    },
  ]);
  tableResults.set('ContactInquiry', [{ data: [], error: null, count: 2 }]);
}

describe('GET /admin/reports/summary', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    script.roleSlug = 'super_admin';
    script.saleError = null;
    script.withdrawalError = null;
    script.commissionError = null;
    tableResults.clear();
    seedDefault();
  });

  it('returns the aggregated operational snapshot', async () => {
    const { res, seen } = capture();
    await summaryHandler(authedGet, res);
    expect(seen.status).toBe(200);
    const body = seen.body as {
      members: { active: number; inactive: number; archived: number };
      registrations: { total: number; pending: number; rejected: number };
      sales: { total: number; byStatus: Record<string, number> };
      withdrawals: {
        pendingCount: number;
        pendingTotal: string;
        completedCount: number;
        completedTotal: string;
        rejectedCount: number;
      };
      commissions: {
        pendingCount: number;
        pendingTotal: string;
        availableCount: number;
        availableTotal: string;
      };
      inquiries: { new: number };
    };
    expect(body.members).toEqual({ active: 4, inactive: 1, archived: 2 });
    expect(body.registrations).toEqual({ total: 6, pending: 1, rejected: 1 });
    expect(body.sales).toEqual({
      total: 3,
      byStatus: {
        SUBMITTED: 1,
        ADMIN_APPROVED: 0,
        PAYMENT_VERIFIED: 2,
        QUALIFYING_SALE: 0,
        REJECTED: 0,
        LOCKED: 0,
      },
    });
    // REQUESTED + RESERVED = pending money; exact-decimal sums.
    expect(body.withdrawals).toEqual({
      pendingCount: 2,
      pendingTotal: '15000.00',
      completedCount: 1,
      completedTotal: '50000.00',
      rejectedCount: 1,
    });
    expect(body.commissions).toEqual({
      pendingCount: 1,
      pendingTotal: '4000.00',
      availableCount: 1,
      availableTotal: '96000.00',
    });
    expect(body.inquiries).toEqual({ new: 2 });
  });

  it('allows finance-role staff', async () => {
    script.roleSlug = 'finance';
    tableResults.clear();
    seedDefault();
    const { res, seen } = capture();
    await summaryHandler(authedGet, res);
    expect(seen.status).toBe(200);
  });

  it('rejects staff without a finance-visible role', async () => {
    script.roleSlug = 'support';
    tableResults.clear();
    seedDefault();
    const { res, seen } = capture();
    await summaryHandler(authedGet, res);
    expect(seen.status).toBe(403);
  });

  it('500s when a count query fails', async () => {
    tableResults.clear();
    seedDefault();
    tableResults.set('Sale', [{ data: null, error: { message: 'db down' } }]);
    const { res, seen } = capture();
    await summaryHandler(authedGet, res);
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});
