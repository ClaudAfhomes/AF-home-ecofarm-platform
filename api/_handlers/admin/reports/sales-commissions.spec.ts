import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import salesCommissionsHandler from './sales-commissions.js';

/**
 * GET /admin/reports/sales-commissions - Supabase is fully mocked with a
 * table-aware fake: verifyStaffModule consumes the StaffUser/StaffAssignment/
 * Role tables, the report reads Sale/Commission/Member, and appendAudit
 * writes AuditLog.
 */
const script = {
  roleSlug: 'super_admin',
  saleRows: [] as Record<string, unknown>[],
  saleError: null as { message: string } | null,
  commissionRows: [] as Record<string, unknown>[],
  commissionError: null as { message: string } | null,
};

function result(data: unknown, error?: unknown, count?: number) {
  return { data, error, ...(count !== undefined ? { count } : {}) };
}

/** Per-table result queues; each from(table) call consumes the next entry. */
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

const SALE_A = {
  id: 'sal-001',
  status: 'QUALIFYING_SALE',
  propertyName: 'Farm Lot 12',
  propertyValue: '1200000.00',
  sellerId: 'mem-1',
  sellerName: 'Juan Dela Cruz',
  submittedAt: '2026-09-05T09:00:00.000Z',
  referrerName: 'Maria Lopez',
};
const SALE_B = {
  id: 'sal-002',
  status: 'SUBMITTED',
  propertyName: 'Condo 8F',
  propertyValue: '500000.00',
  sellerId: 'mem-2',
  sellerName: 'Ana Santos',
  submittedAt: '2026-08-20T09:00:00.000Z',
};

function seedDefault() {
  tableResults.set('StaffUser', [{ data: null, error: null }]);
  tableResults.set('StaffAssignment', [{ data: [{ roleId: 'role-1' }], error: null }]);
  tableResults.set('Role', [{ data: [{ slug: script.roleSlug }], error: null }]);
  tableResults.set('Sale', [{ data: script.saleRows, error: script.saleError }]);
  tableResults.set('Commission', [
    { data: script.commissionRows, error: script.commissionError },
  ]);
  tableResults.set('Member', [
    { data: [{ id: 'mem-1', firstName: 'Maria', lastName: 'Lopez' }], error: null },
  ]);
  tableResults.set('AuditLog', [{ data: null, error: null }]);
}

describe('GET /admin/reports/sales-commissions', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    script.roleSlug = 'super_admin';
    script.saleRows = [SALE_A, SALE_B];
    script.saleError = null;
    script.commissionRows = [
      {
        id: 'com-001',
        saleId: 'sal-001',
        memberId: 'mem-1',
        commissionType: 'DIRECT_COMMISSION',
        amount: '96000.00',
        status: 'AVAILABLE',
        createdAt: '2026-09-06T00:00:00.000Z',
        clearedAt: '2026-09-12T00:00:00.000Z',
      },
    ];
    script.commissionError = null;
    tableResults.clear();
    seedDefault();
  });

  it('returns the aggregated report with exact-decimal totals', async () => {
    const { res, seen } = capture();
    await salesCommissionsHandler(authedGet, res);
    expect(seen.status).toBe(200);
    const body = seen.body as {
      summary: {
        salesCount: number;
        salesValueTotal: string;
        salesByStatus: Record<string, { count: number; total: string }>;
        commissionsByStatus: Record<string, { count: number; total: string }>;
      };
      commissions: { memberName: string }[];
      range: { from: string | null; to: string | null };
    };
    // Headline counts only QUALIFYING_SALE rows (SALE_B is SUBMITTED pipeline).
    expect(body.summary.salesCount).toBe(1);
    expect(body.range).toEqual({ from: null, to: null });
    expect(body.summary.salesValueTotal).toBe('1200000.00');
    expect(body.summary.salesByStatus.QUALIFYING_SALE).toEqual({
      count: 1,
      total: '1200000.00',
    });
    expect(body.summary.commissionsByStatus.AVAILABLE).toEqual({
      count: 1,
      total: '96000.00',
    });
    expect(body.commissions[0]?.memberName).toBe('Maria Lopez');
  });

  it('filters by from/to and echoes the range', async () => {
    script.saleRows = [SALE_A, SALE_B];
    tableResults.clear();
    seedDefault();
    const { res, seen } = capture();
    await salesCommissionsHandler(
      { ...authedGet, query: { from: '2026-09-01', to: '2026-09-30' } } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const body = seen.body as {
      sales: unknown[];
      range: { from: string; to: string };
    };
    expect(body.range.from).toBe('2026-09-01');
    expect(body.range.to).toBe('2026-09-30');
    expect(body.sales).toHaveLength(1);
  });

  it('400s on malformed dates', async () => {
    const { res, seen } = capture();
    await salesCommissionsHandler(
      { ...authedGet, query: { from: 'september' } } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(400);
    expect(seen.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects staff without a finance-visible role', async () => {
    script.roleSlug = 'support';
    tableResults.clear();
    seedDefault();
    const { res, seen } = capture();
    await salesCommissionsHandler(authedGet, res);
    expect(seen.status).toBe(403);
  });

  it('500s when the sale query fails', async () => {
    script.saleError = { message: 'db down' };
    tableResults.clear();
    seedDefault();
    const { res, seen } = capture();
    await salesCommissionsHandler(authedGet, res);
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL' } });
  });

  it('500s when the commission query fails', async () => {
    script.commissionError = { message: 'db down' };
    tableResults.clear();
    seedDefault();
    const { res, seen } = capture();
    await salesCommissionsHandler(authedGet, res);
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});
