import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import listAdjustments from './adjustments.js';

/**
 * SUP-only matrix for GET /admin/adjustments (Phase B5): the endpoint must
 * 401 credential-less callers, 403 every staff role except super_admin, and
 * 200 super_admin with the validated list envelope. Supabase is fully mocked;
 * the role under test is switched via `setRoleSlug`.
 */
const mocks = vi.hoisted(() => {
  let roleSlug = 'super_admin';
  let adjustmentRows: Record<string, unknown>[] = [];
  const service = {
    from: (table: string) => ({
      select: (..._args: unknown[]) => ({
        eq: async () =>
          table === 'MemberRole' || table === 'StaffAssignment'
            ? { data: [{ roleId: 'r-1' }], error: null }
            : { data: null, error: new Error(`unexpected eq on ${table}`) },
        in: async () =>
          table === 'Role'
            ? { data: [{ slug: roleSlug }], error: null }
            : { data: null, error: new Error(`unexpected in on ${table}`) },
        order: async () =>
          table === 'Adjustment'
            ? { data: adjustmentRows, error: null }
            : { data: [], error: null },
      }),
    }),
  };
  const anon = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'u-1', user_metadata: {} } }, error: null }),
    },
  };
  return {
    service,
    anon,
    setRoleSlug: (slug: string) => {
      roleSlug = slug;
    },
    setRows: (rows: Record<string, unknown>[]) => {
      adjustmentRows = rows;
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

const ROW = {
  id: 'adj-001',
  memberId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  memberName: 'Maria Santos',
  entryType: 'FINANCIAL_ADJUSTMENT',
  direction: 'CREDIT',
  amount: '250.00',
  reason: 'Correction for missing referral credit on sale sal-002',
  createdBy: 'Ada Admin',
  createdAt: '2026-08-18T11:00:00.000Z',
};

describe('GET /admin/adjustments role matrix', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://matrix.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.setRows([ROW]);
  });

  it('401s without credentials', async () => {
    const { res, seen } = capture();
    await listAdjustments({ method: 'GET', query: {}, headers: {} } as VercelRequest, res);
    expect(seen.status).toBe(401);
  });

  it.each(['admin', 'finance', 'merchant', 'user'])('403s the %s role', async (slug) => {
    mocks.setRoleSlug(slug);
    const { res, seen } = capture();
    await listAdjustments(
      { method: 'GET', query: {}, headers: { authorization: 'Bearer good' } } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(403);
  });

  it('200s super_admin with the validated list envelope', async () => {
    mocks.setRoleSlug('super_admin');
    const { res, seen } = capture();
    await listAdjustments(
      { method: 'GET', query: {}, headers: { authorization: 'Bearer good' } } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const body = seen.body as { data: unknown[]; meta: { total: number } };
    expect(body.meta.total).toBe(1);
    expect(body.data[0]).toMatchObject({ id: 'adj-001', memberName: 'Maria Santos' });
  });

  it('filters rows that fail contract validation', async () => {
    mocks.setRoleSlug('super_admin');
    mocks.setRows([ROW, { ...ROW, id: 'adj-bad', amount: 'not-a-decimal' }]);
    const { res, seen } = capture();
    await listAdjustments(
      { method: 'GET', query: {}, headers: { authorization: 'Bearer good' } } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const body = seen.body as { data: unknown[]; meta: { total: number } };
    expect(body.meta.total).toBe(1);
  });
});
