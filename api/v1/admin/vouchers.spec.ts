import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import templateHandler from './voucher-templates/[id].js';
import createTemplateHandler from './voucher-templates.js';
import assignHandler from './vouchers/assign.js';
import deleteCategoryHandler from './property-categories/[slug].js';

/**
 * B7 admin write matrix (Phase B7): role gates, validation, and key
 * transitions for voucher templates, assignment, and category deletion.
 * Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    one: {} as Record<string, unknown>,
    single: {} as Record<string, unknown>,
    list: {} as Record<string, unknown[]>,
    propertyCount: 0,
    /** Injected error for the next Voucher insert (duplicate-assignment test). */
    voucherInsertError: null as { code?: string; message: string } | null,
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
    b.single = async () => ({ data: script.single[table] ?? null, error: null });
    // Bare awaited chains: link rows for auth, counts for delete guards,
    // full lists for code generation.
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-1' }], error: null });
      } else if (table === 'Property')
        resolve({ data: [], error: null, count: script.propertyCount });
      else resolve({ data: script.list[table] ?? null, error: null });
    };
    return {
      ...b,
      insert: async (row: unknown) => {
        calls.push({ table, op: 'insert', arg: row });
        if (table === 'Voucher' && script.voucherInsertError) {
          return { error: script.voucherInsertError };
        }
        return { error: null };
      },
      upsert: async (row: unknown) => {
        calls.push({ table, op: 'upsert', arg: row });
        return { error: null };
      },
      update: (patch: unknown) => {
        calls.push({ table, op: 'update', arg: patch });
        return { eq: () => ({ select: () => ({ single: b.single }) }) };
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

const TEMPLATE = {
  id: 'vtpl-001',
  title: 'Welcome Gift',
  originalValue: '500.00',
  createdAt: '2026-08-01T00:00:00.000Z',
};

describe('POST /admin/voucher-templates', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://b7.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'super_admin';
    mocks.script.one = {};
    mocks.script.single = {};
  });

  it('403s finance and 400s invalid bodies', async () => {
    mocks.script.roleSlug = 'finance';
    const forbidden = capture();
    await createTemplateHandler(
      req('POST', {}, { title: 'T', originalValue: '10.00' }),
      forbidden.res,
    );
    expect(forbidden.seen.status).toBe(403);

    mocks.script.roleSlug = 'super_admin';
    const invalid = capture();
    await createTemplateHandler(req('POST', {}, { title: '', originalValue: 'abc' }), invalid.res);
    expect(invalid.seen.status).toBe(400);
  });

  it('201s a template with an audit entry', async () => {
    const { res, seen } = capture();
    await createTemplateHandler(
      req('POST', {}, { title: 'Gift', originalValue: '500.00', validityDays: 90 }),
      res,
    );
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({ title: 'Gift', originalValue: '500.00' });
    const insert = mocks.calls.find((c) => c.table === 'VoucherTemplate')?.arg as Record<
      string,
      unknown
    >;
    expect(insert.validityDays).toBe(90);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(audit).toMatchObject({ action: 'VOUCHER_TEMPLATE_CREATED' });
  });
});

describe('PATCH/DELETE /admin/voucher-templates/:id', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://b7.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'admin';
    mocks.script.one = { VoucherTemplate: TEMPLATE };
    mocks.script.single = { VoucherTemplate: { ...TEMPLATE, title: 'Renamed' } };
  });

  it('404s unknown templates and 400s empty patches', async () => {
    mocks.script.one = {};
    const missing = capture();
    await templateHandler(req('PATCH', { id: 'vtpl-404' }, { title: 'X' }), missing.res);
    expect(missing.seen.status).toBe(404);

    mocks.script.one = { VoucherTemplate: TEMPLATE };
    const empty = capture();
    await templateHandler(req('PATCH', { id: 'vtpl-001' }, {}), empty.res);
    expect(empty.seen.status).toBe(400);
  });

  it('patches and cascades deletes to assignments', async () => {
    const patched = capture();
    await templateHandler(req('PATCH', { id: 'vtpl-001' }, { title: 'Renamed' }), patched.res);
    expect(patched.seen.status).toBe(200);
    expect(patched.seen.body).toMatchObject({ title: 'Renamed' });

    const removed = capture();
    await templateHandler(req('DELETE', { id: 'vtpl-001' }), removed.res);
    expect(removed.seen.status).toBe(200);
    expect(mocks.calls.some((c) => c.table === 'Voucher' && c.op === 'delete')).toBe(true);
  });
});

describe('POST /admin/vouchers/assign', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://b7.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'admin';
    mocks.script.one = {
      VoucherTemplate: TEMPLATE,
      Member: { id: 'mem-uuid-1', firstName: 'Juan', lastName: 'Dela Cruz', name: null },
    };
    mocks.script.list = { Voucher: [{ code: 'JAD-VCH-2026-101' }] };
    mocks.script.voucherInsertError = null;
  });

  it('404s unknown templates or members', async () => {
    mocks.script.one = { Member: { id: 'mem-uuid-1' } };
    const noTemplate = capture();
    await assignHandler(
      req('POST', {}, { templateId: 'vtpl-404', memberId: 'mem-uuid-1' }),
      noTemplate.res,
    );
    expect(noTemplate.seen.status).toBe(404);

    mocks.script.one = { VoucherTemplate: TEMPLATE };
    const noMember = capture();
    await assignHandler(
      req('POST', {}, { templateId: 'vtpl-001', memberId: 'mem-404' }),
      noMember.res,
    );
    expect(noMember.seen.status).toBe(404);
  });

  it('201s an assignment with generated code and snapshotted expiry', async () => {
    const { res, seen } = capture();
    await assignHandler(req('POST', {}, { templateId: 'vtpl-001', memberId: 'mem-uuid-1' }), res);
    expect(seen.status).toBe(201);
    const body = seen.body as Record<string, unknown>;
    expect(body.code).toBe('JAD-VCH-2026-102');
    expect(body).toMatchObject({
      templateId: 'vtpl-001',
      memberId: 'mem-uuid-1',
      memberName: 'Juan Dela Cruz',
      remainingValue: '500.00',
      status: 'ACTIVE',
    });
  });

  it('honors the per-assignment expiry rule (fixed date wins over template)', async () => {
    const { res, seen } = capture();
    await assignHandler(
      req(
        'POST',
        {},
        { templateId: 'vtpl-001', memberId: 'mem-uuid-1', expiresAt: '2027-01-01T00:00:00.000Z' },
      ),
      res,
    );
    expect(seen.status).toBe(201);
    const body = seen.body as Record<string, unknown>;
    expect(body.expiresAt).toBe('2027-01-01T00:00:00.000Z');
  });

  it('409s a duplicate assignment for the same member and voucher', async () => {
    mocks.script.list = { Voucher: [{ code: 'JAD-VCH-2026-101' }] };
    mocks.script.voucherInsertError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "Voucher_member_template_uidx"',
    };
    const { res, seen } = capture();
    await assignHandler(req('POST', {}, { templateId: 'vtpl-001', memberId: 'mem-uuid-1' }), res);
    expect(seen.status).toBe(409);
    expect((seen.body as { error: { message: string } }).error.message).toContain(
      'already has this voucher',
    );
  });
});

describe('DELETE /admin/property-categories/:slug', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://b7.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'admin';
    mocks.script.propertyCount = 0;
    mocks.script.one = {
      PropertyCategory: { slug: 'cat', title: 'Cat' },
      cms_contents: { key: 'properties', content: { categories: [] }, version: 1 },
    };
  });

  it('409s categories with listings and deletes empty ones', async () => {
    mocks.script.propertyCount = 2;
    const blocked = capture();
    await deleteCategoryHandler(req('DELETE', { slug: 'cat' }), blocked.res);
    expect(blocked.seen.status).toBe(409);

    mocks.script.propertyCount = 0;
    const removed = capture();
    await deleteCategoryHandler(req('DELETE', { slug: 'cat' }), removed.res);
    expect(removed.seen.status).toBe(200);
    expect(removed.seen.body).toMatchObject({ id: 'cat', deleted: true });
  });
});
