import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import memberById from './members/[id].js';

/**
 * Qualification grant/revoke on PATCH /admin/members/:id (super_admin +
 * admin): flag + member_qualified role sync + audit, and the guards around
 * it (role 403, 409 unless APPROVED_ACTIVE, 400 non-boolean).
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    member: null as unknown,
    updatedMember: null as unknown,
    qualifiedRoleId: 'role-qualified' as string | null,
    rpcResult: { data: null as unknown, error: null as unknown },
    authDeleteError: null as unknown,
    authDeleteFailures: 0,
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.limit = async () => ({ data: [], error: null });
    b.order = async () => ({ data: [], error: null });
    b.in = async (key: string) => {
      if (table === 'Role' && key === 'slug')
        return { data: [{ slug: script.roleSlug }], error: null };
      if (table === 'Role') return { data: [{ slug: script.roleSlug }], error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        return { data: [{ roleId: 'r-1' }], error: null };
      }
      if (table === 'Role')
        return script.qualifiedRoleId
          ? { data: { id: script.qualifiedRoleId, slug: 'member_qualified' }, error: null }
          : { data: null, error: null };
      if (table === 'Member') return { data: script.member, error: null };
      return { data: null, error: null };
    };
    b.single = async () => ({ data: script.updatedMember, error: null });
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-1' }], error: null });
      } else resolve({ data: null, error: null });
    };
    return {
      ...b,
      insert: async (row: unknown) => {
        calls.push({ table, op: 'insert', arg: row });
        return { error: null };
      },
      upsert: async (row: unknown) => {
        calls.push({ table, op: 'upsert', arg: row });
        return { error: null };
      },
      update: (patch: unknown) => {
        calls.push({ table, op: 'update', arg: patch });
        return {
          eq: () => ({ select: () => ({ single: b.single }) }),
        };
      },
      delete: () => ({
        eq: () => ({
          eq: async () => {
            calls.push({ table, op: 'delete' });
            return { error: null };
          },
        }),
      }),
    };
  };
  return {
    calls,
    script,
    setRoleSlug: (slug: string) => {
      script.roleSlug = slug;
    },
    service: {
      from: (table: string) => builder(table),
      rpc: async (fn: string, args: unknown) => {
        calls.push({ table: `rpc:${fn}`, op: 'rpc', arg: args });
        return script.rpcResult;
      },
      auth: {
        admin: {
          deleteUser: async (id: string) => {
            calls.push({ table: 'auth.users', op: 'deleteUser', arg: id });
            if (script.authDeleteFailures > 0) {
              script.authDeleteFailures -= 1;
              return { error: { message: 'transient auth failure' } };
            }
            return { error: script.authDeleteError };
          },
        },
      },
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

const authed = { authorization: 'Bearer good' };
const patchReq = (body: unknown): VercelRequest =>
  ({ method: 'PATCH', query: { id: 'mem-uuid-1' }, headers: authed, body }) as VercelRequest;

function approvedMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-uuid-1',
    email: 'juan@example.com',
    name: 'Juan Dela Cruz',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    phone: '+639170000001',
    dateOfBirth: '1990-01-01',
    gender: 'Male',
    countryCode: 'PH',
    countryName: 'Philippines',
    status: 'APPROVED_ACTIVE',
    isQualified: false,
    accountStatus: 'ACTIVE',
    programId: 'prg-domestic',
    referralCode: 'JD-2026-001',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function parsePatch() {
  return mocks.calls.find((c) => c.table === 'Member' && c.op === 'update')?.arg as Record<
    string,
    unknown
  >;
}

describe('PATCH /admin/members/:id qualification', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://m.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.setRoleSlug('super_admin');
    mocks.script.qualifiedRoleId = 'role-qualified';
    mocks.script.member = approvedMember();
    mocks.script.updatedMember = approvedMember({ isQualified: true });
    mocks.script.rpcResult = {
      data: {
        purged: { id: 'mem-uuid-1', email: 'juan@example.com', name: 'Juan Dela Cruz' },
      },
      error: null,
    };
    mocks.script.authDeleteError = null;
    mocks.script.authDeleteFailures = 0;
  });

  it('403s merchant and other non-staff roles', async () => {
    mocks.setRoleSlug('merchant');
    const { res, seen } = capture();
    await memberById(patchReq({ isQualified: true }), res);
    expect(seen.status).toBe(403);
  });

  it('400s non-boolean values', async () => {
    const { res, seen } = capture();
    await memberById(patchReq({ isQualified: 'yes' }), res);
    expect(seen.status).toBe(400);
  });

  it('409s granting qualification to a non-approved member', async () => {
    mocks.script.member = approvedMember({ status: 'PENDING' });
    const { res, seen } = capture();
    await memberById(patchReq({ isQualified: true }), res);
    expect(seen.status).toBe(409);
  });

  it('grants qualification: flag, member_qualified role link, audit', async () => {
    const { res, seen } = capture();
    await memberById(patchReq({ isQualified: true }), res);
    expect(seen.status).toBe(200);
    expect(parsePatch()).toEqual({ isQualified: true });
    const link = mocks.calls.find((c) => c.table === 'MemberRole' && c.op === 'upsert')?.arg as {
      memberId: string;
      roleId: string;
    };
    expect(link).toEqual({ memberId: 'mem-uuid-1', roleId: 'role-qualified' });
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(audit).toMatchObject({ action: 'MEMBER_QUALIFIED', target_id: 'mem-uuid-1' });
  });

  it('revokes qualification: flag off, role link removed, audit', async () => {
    mocks.script.member = approvedMember({ isQualified: true });
    mocks.script.updatedMember = approvedMember({ isQualified: false });
    const { res, seen } = capture();
    await memberById(patchReq({ isQualified: false }), res);
    expect(seen.status).toBe(200);
    expect(parsePatch()).toEqual({ isQualified: false });
    expect(mocks.calls.some((c) => c.table === 'MemberRole' && c.op === 'delete')).toBe(true);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(audit).toMatchObject({ action: 'MEMBER_UNQUALIFIED' });
  });

  it('no-ops and 400s when the flag is unchanged', async () => {
    mocks.script.member = approvedMember({ isQualified: false });
    const { res, seen } = capture();
    await memberById(patchReq({ isQualified: false }), res);
    expect(seen.status).toBe(400);
    expect(parsePatch()).toBeUndefined();
  });

  it('refuses hard deletion without a reason', async () => {
    const { res, seen } = capture();
    await memberById(
      { method: 'DELETE', query: { id: 'mem-uuid-1' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(422);
    expect(seen.body).toMatchObject({ error: { code: 'REJECTION_REASON_REQUIRED' } });
    expect(mocks.calls.some((c) => c.op === 'rpc')).toBe(false);
  });
});

describe('DELETE /admin/members/:id permanent purge (super_admin only)', () => {
  const deleteReq = (body?: unknown): VercelRequest =>
    ({ method: 'DELETE', query: { id: 'mem-uuid-1' }, headers: authed, body }) as VercelRequest;

  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://m.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.setRoleSlug('super_admin');
    mocks.script.qualifiedRoleId = 'role-qualified';
    mocks.script.member = approvedMember();
    mocks.script.updatedMember = approvedMember({ isQualified: true });
    mocks.script.rpcResult = {
      data: {
        purged: { id: 'mem-uuid-1', email: 'juan@example.com', name: 'Juan Dela Cruz' },
      },
      error: null,
    };
    mocks.script.authDeleteError = null;
    mocks.script.authDeleteFailures = 0;
  });

  it('403s non-super-admin staff before any mutation', async () => {
    mocks.setRoleSlug('admin');
    const { res, seen } = capture();
    await memberById(deleteReq({ reason: 'cleanup' }), res);
    expect(seen.status).toBe(403);
    expect(mocks.calls.some((c) => c.op === 'rpc')).toBe(false);
    expect(mocks.calls.some((c) => c.table === 'auth.users')).toBe(false);
  });

  it('422s when the reason is missing or blank', async () => {
    const { res, seen } = capture();
    await memberById(deleteReq({ reason: '   ' }), res);
    expect(seen.status).toBe(422);
    expect(seen.body).toMatchObject({ error: { code: 'REJECTION_REASON_REQUIRED' } });
    expect(mocks.calls.some((c) => c.op === 'rpc')).toBe(false);
  });

  it('404s when the member does not exist', async () => {
    mocks.script.member = null;
    const { res, seen } = capture();
    await memberById(deleteReq({ reason: 'cleanup' }), res);
    expect(seen.status).toBe(404);
    expect(mocks.calls.some((c) => c.op === 'rpc')).toBe(false);
  });

  it('purges via the DB function, removes the auth user, and audits', async () => {
    const { res, seen } = capture();
    await memberById(deleteReq({ reason: 'Duplicate test account' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ purgedId: 'mem-uuid-1', authRemoved: true });
    const rpc = mocks.calls.find((c) => c.table === 'rpc:member_purge_cascade');
    expect(rpc?.arg).toEqual({
      p_member: 'mem-uuid-1',
      p_actor: 'staff-uuid-1',
      p_reason: 'Duplicate test account',
    });
    const authDelete = mocks.calls.find((c) => c.table === 'auth.users');
    expect(authDelete?.op).toBe('deleteUser');
    expect(authDelete?.arg).toBe('mem-uuid-1');
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(audit).toMatchObject({
      action: 'MEMBER_PURGED',
      actor_id: 'staff-uuid-1',
      target_type: 'Member',
      target_id: 'mem-uuid-1',
    });
    expect(String(audit.detail)).toContain('Duplicate test account');
  });

  it('maps DB-function errors to the standard envelope', async () => {
    mocks.script.rpcResult = {
      data: { error: { code: 'NOT_FOUND', message: 'Member not found.', status: 404 } },
      error: null,
    };
    const { res, seen } = capture();
    await memberById(deleteReq({ reason: 'cleanup' }), res);
    expect(seen.status).toBe(404);
    expect(seen.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(mocks.calls.some((c) => c.table === 'auth.users')).toBe(false);
  });

  it('still audits when the auth user is already absent', async () => {
    mocks.script.authDeleteError = { message: 'user not found' };
    const { res, seen } = capture();
    await memberById(deleteReq({ reason: 'cleanup' }), res);
    expect(seen.status).toBe(200);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(String(audit.detail)).toContain('auth user removal failed');
  });

  it('retries a transient auth-user deletion failure and reports authRemoved', async () => {
    mocks.script.authDeleteFailures = 1;
    const { res, seen } = capture();
    await memberById(deleteReq({ reason: 'cleanup' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ purgedId: 'mem-uuid-1', authRemoved: true });
    expect(mocks.calls.filter((c) => c.table === 'auth.users').length).toBe(2);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(String(audit.detail)).not.toContain('auth user removal failed');
  });

  it('reports authRemoved:false when auth deletion ultimately fails', async () => {
    mocks.script.authDeleteError = { message: 'user not found' };
    const { res, seen } = capture();
    await memberById(deleteReq({ reason: 'cleanup' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ purgedId: 'mem-uuid-1', authRemoved: false });
    // One retry before giving up — the Member row is already gone.
    expect(mocks.calls.filter((c) => c.table === 'auth.users').length).toBe(2);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(String(audit.detail)).toContain('auth user removal failed');
  });
});
