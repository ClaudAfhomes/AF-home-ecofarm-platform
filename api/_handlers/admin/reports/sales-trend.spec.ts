import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import salesTrendHandler from './sales-trend.js';

/**
 * GET /admin/reports/sales-trend - Supabase fully mocked with per-table
 * result queues: auth consumes StaffUser/StaffAssignment/Role, the report
 * reads Sale.
 */
const script = {
  roleSlug: 'super_admin',
  saleRows: [] as Record<string, unknown>[],
  saleError: null as { message: string } | null,
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

const THIS = new Date();
const y = THIS.getUTCFullYear();
const m = String(THIS.getUTCMonth() + 1).padStart(2, '0');

function seedDefault() {
  tableResults.set('StaffUser', [{ data: null, error: null }]);
  tableResults.set('StaffAssignment', [{ data: [{ roleId: 'role-1' }], error: null }]);
  tableResults.set('Role', [{ data: [{ slug: script.roleSlug }], error: null }]);
  tableResults.set('Sale', [{ data: script.saleRows, error: script.saleError }]);
}

describe('GET /admin/reports/sales-trend', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://money.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    script.roleSlug = 'super_admin';
    script.saleError = null;
    tableResults.clear();
    seedDefault();
  });

  it('zero-fills continuous months and aggregates exact-decimal totals', async () => {
    const prevMonth = new Date(THIS);
    prevMonth.setUTCMonth(THIS.getUTCMonth() - 1);
    const pmKey = `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, '0')}`;
    script.saleRows = [
      {
        submittedAt: `${pmKey}-15T00:00:00.000Z`,
        propertyValue: '1200000.00',
      },
      { submittedAt: `${pmKey}-16T00:00:00.000Z`, propertyValue: '5000.25' },
      // Filtered out: money format invalid for the exact-decimal guard.
      { submittedAt: `${pmKey}-17T00:00:00.000Z`, propertyValue: '1,000.00' },
      // This-month sale counts toward the last bucket.
      {
        submittedAt: `${y}-${m}-05T00:00:00.000Z`,
        propertyValue: '60000.00',
      },
    ];
    tableResults.clear();
    seedDefault();

    const { res, seen } = capture();
    await salesTrendHandler(authedGet, res);
    expect(seen.status).toBe(200);
    const body = seen.body as {
      granularity: string;
      periods: { key: string; count: number; total: string }[];
    };
    expect(body.granularity).toBe('month');
    expect(body.periods).toHaveLength(12);
    const pmRow = body.periods.find((p) => p.key === pmKey);
    expect(pmRow).toEqual({ key: pmKey, count: 2, total: '1205000.25' });
    const lastRow = body.periods.at(-1);
    expect(lastRow).toEqual({ key: `${y}-${m}`, count: 1, total: '60000.00' });
    // Continuous keys, oldest first.
    expect(body.periods[0]?.key).not.toBe(lastRow?.key);
  });

  it('aggregates by year from the earliest sale year', async () => {
    script.saleRows = [
      { submittedAt: `${y - 2}-06-15T00:00:00.000Z`, propertyValue: '1000.00' },
      { submittedAt: `${y - 2}-07-15T00:00:00.000Z`, propertyValue: '2000.00' },
      { submittedAt: `${y}-01-15T00:00:00.000Z`, propertyValue: '500.50' },
    ];
    tableResults.clear();
    seedDefault();

    const { res, seen } = capture();
    await salesTrendHandler({ ...authedGet, query: { granularity: 'year' } } as VercelRequest, res);
    expect(seen.status).toBe(200);
    const body = seen.body as {
      granularity: string;
      periods: { key: string; count: number; total: string }[];
    };
    expect(body.granularity).toBe('year');
    // Continuous years from (y-2)..y.
    expect(body.periods).toHaveLength(3);
    expect(body.periods[0]).toEqual({ key: String(y - 2), count: 2, total: '3000.00' });
    expect(body.periods.at(-1)).toEqual({
      key: String(y),
      count: 1,
      total: '500.50',
    });
  });

  it('400s on invalid granularity', async () => {
    const { res, seen } = capture();
    await salesTrendHandler(
      { ...authedGet, query: { granularity: 'week' } } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(400);
    expect(seen.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('400s on malformed months param', async () => {
    const { res, seen } = capture();
    await salesTrendHandler({ ...authedGet, query: { months: 'nope' } } as VercelRequest, res);
    expect(seen.status).toBe(400);
  });

  it('rejects staff without a finance-visible role', async () => {
    script.roleSlug = 'support';
    tableResults.clear();
    seedDefault();
    const { res, seen } = capture();
    await salesTrendHandler(authedGet, res);
    expect(seen.status).toBe(403);
  });

  it('500s when the sale query fails', async () => {
    script.saleError = { message: 'db down' };
    tableResults.clear();
    seedDefault();
    const { res, seen } = capture();
    await salesTrendHandler(authedGet, res);
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});
