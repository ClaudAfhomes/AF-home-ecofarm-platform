import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import scanVoucherHandler from './scan.js';
import redeemVoucherHandler from './[id]/redeem.js';

/**
 * Admin voucher scan / redeem lifecycle:
 *   POST /admin/vouchers/scan   — resolve a QR code (verify-only)
 *   POST /admin/vouchers/:id/redeem — confirm a scan, redeem in full
 * Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    one: {} as Record<string, unknown>,
    list: {} as Record<string, unknown[]>,
    inserted: {} as Record<string, unknown>,
    updated: {} as Record<string, unknown>,
    insertError: null as { code?: string; message: string } | null,
    voucherInsertErrors: [] as ({ code?: string; message: string } | null)[],
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = async () => ({ data: script.list[table] ?? [], error: null });
    b.in = async () => {
      if (table === 'Role') return { data: [{ slug: script.roleSlug }], error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => ({ data: script.one[table] ?? null, error: null });
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffUser') {
        resolve({ data: [{ status: 'ACTIVE', mustChangePassword: false }], error: null });
      } else if (table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-1' }], error: null });
      } else if (table === 'Role') {
        resolve({ data: [{ id: 'r-1', slug: script.roleSlug }], error: null });
      } else if (table === 'Voucher') {
        resolve({ data: script.list[table] ?? [], error: null });
      } else {
        resolve({ data: null, error: null });
      }
    };
    return {
      ...b,
      insert: (row: unknown) => {
        calls.push({ table, op: 'insert', arg: row });
        if (table === 'Voucher' && script.voucherInsertErrors.length > 0) {
          const err = script.voucherInsertErrors.shift();
          if (err) return { error: err };
        }
        if (table === 'Voucher' && script.insertError) {
          return { error: script.insertError };
        }
        const data = script.inserted[table] ?? script.one[table] ?? null;
        const chain = {
          data,
          error: null,
          select: () => chain,
          single: async () => ({ data, error: null }),
          maybeSingle: async () => ({ data, error: null }),
        };
        return chain;
      },
      update: (patch: unknown) => {
        calls.push({ table, op: 'update', arg: patch });
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: script.updated[table] ?? null, error: null }),
                single: async () => ({ data: script.updated[table] ?? null, error: null }),
              }),
            }),
          }),
        };
      },
      delete: () => {
        calls.push({ table, op: 'delete' });
        return { eq: async () => ({ error: null }) };
      },
    };
  };
  return {
    calls,
    script,
    service: { from: (table: string) => builder(table) },
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
const req = (method: string, query: unknown, body?: unknown): VercelRequest =>
  ({ method, query, headers: authed, body }) as VercelRequest;

describe('POST /admin/vouchers/scan', () => {
  const ACTIVE_VOUCHER = {
    id: 'vch-001',
    code: 'JAD-VCH-2026-101',
    templateId: 'vtpl-001',
    title: 'Welcome Gift',
    originalValue: '500.00',
    remainingValue: '500.00',
    status: 'ACTIVE',
    memberId: 'mem-uuid-1',
    memberName: 'Juan Dela Cruz',
    createdAt: '2026-09-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://vch.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'admin';
    mocks.script.one = { Voucher: ACTIVE_VOUCHER };
    mocks.script.insertError = null;
  });

  it('400s without a code and 404s unknown codes', async () => {
    const noCode = capture();
    await scanVoucherHandler(req('POST', {}, {}), noCode.res);
    expect(noCode.seen.status).toBe(400);

    mocks.script.one = {};
    const missing = capture();
    await scanVoucherHandler(req('POST', {}, { code: 'JAD-VCH-2026-999' }), missing.res);
    expect(missing.seen.status).toBe(404);
  });

  it('409s already-redeemed vouchers', async () => {
    mocks.script.one = {
      Voucher: { ...ACTIVE_VOUCHER, status: 'FULLY_REDEEMED', remainingValue: '0.00' },
    };
    const { res, seen } = capture();
    await scanVoucherHandler(req('POST', {}, { code: 'JAD-VCH-2026-101' }), res);
    expect(seen.status).toBe(409);
    expect((seen.body as { error: { message: string } }).error.message).toContain('already');
  });

  it('409s expired vouchers', async () => {
    mocks.script.one = { Voucher: { ...ACTIVE_VOUCHER, expiresAt: '2020-01-01T00:00:00.000Z' } };
    const { res, seen } = capture();
    await scanVoucherHandler(req('POST', {}, { code: 'JAD-VCH-2026-101' }), res);
    expect(seen.status).toBe(409);
    expect((seen.body as { error: { message: string } }).error.message).toContain('expired');
  });

  it('200s a valid scan with the voucher assignment', async () => {
    const { res, seen } = capture();
    await scanVoucherHandler(req('POST', {}, { code: 'JAD-VCH-2026-101' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      id: 'vch-001',
      memberName: 'Juan Dela Cruz',
      status: 'ACTIVE',
    });
  });
});

describe('POST /admin/vouchers/:id/redeem', () => {
  const ACTIVE_VOUCHER = {
    id: 'vch-001',
    code: 'JAD-VCH-2026-101',
    templateId: 'vtpl-001',
    title: 'Welcome Gift',
    originalValue: '500.00',
    remainingValue: '500.00',
    status: 'ACTIVE',
    memberId: 'mem-uuid-1',
    memberName: 'Juan Dela Cruz',
    createdAt: '2026-09-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://vch.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'admin';
    mocks.script.one = { Voucher: ACTIVE_VOUCHER };
    mocks.script.updated = {
      Voucher: { ...ACTIVE_VOUCHER, status: 'FULLY_REDEEMED', remainingValue: '0.00' },
    };
    mocks.script.insertError = null;
  });

  it('404s unknown vouchers and 400s missing ids', async () => {
    mocks.script.one = {};
    const missing = capture();
    await redeemVoucherHandler(req('POST', { id: 'vch-999' }), missing.res);
    expect(missing.seen.status).toBe(404);

    const noId = capture();
    await redeemVoucherHandler(req('POST', {}), noId.res);
    expect(noId.seen.status).toBe(400);
  });

  it('409s vouchers that are not ACTIVE', async () => {
    mocks.script.one = { Voucher: { ...ACTIVE_VOUCHER, status: 'FULLY_REDEEMED' } };
    const { res, seen } = capture();
    await redeemVoucherHandler(req('POST', { id: 'vch-001' }), res);
    expect(seen.status).toBe(409);
  });

  it('200s a redemption, updating remaining to 0.00 with audit', async () => {
    const { res, seen } = capture();
    await redeemVoucherHandler(req('POST', { id: 'vch-001' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      id: 'vch-001',
      status: 'FULLY_REDEEMED',
      remainingValue: '0.00',
    });
    const update = mocks.calls.find((c) => c.table === 'Voucher' && c.op === 'update')
      ?.arg as Record<string, unknown>;
    expect(update).toMatchObject({
      status: 'FULLY_REDEEMED',
      remainingValue: '0.00',
      redeemedBy: 'staff-uuid-1',
    });
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(audit).toMatchObject({ action: 'VOUCHER_REDEEMED' });
  });
});
