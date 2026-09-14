import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './session.js';

/**
 * GET /admin/session — own staff session resolved server-side (no anon Role
 * reads). PATCH /admin/session — update own display name. Supabase is fully
 * mocked.
 */
const mocks = vi.hoisted(() => {
  const script = {
    staffRow: {
      id: 'u-1',
      email: 'admin@jad.local',
      name: 'Admin User',
      status: 'ACTIVE',
      mustChangePassword: false,
    } as Record<string, unknown> | null,
    slugs: ['super_admin'] as string[],
    roleRows: [] as Record<string, unknown>[],
  };
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = async () => {
      if (table === 'Role')
        return { data: script.slugs.map((slug) => ({ slug })), error: null };
      return { data: [], error: null };
    };
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffAssignment') resolve({ data: [{ roleId: 'r-1' }], error: null });
      else if (table === 'Role') resolve({ data: script.roleRows, error: null });
      else resolve({ data: null, error: null });
    };
    b.maybeSingle = async () => {
      if (table === 'StaffUser') return { data: script.staffRow, error: null };
      return { data: null, error: null };
    };
    b.update = (patch: unknown) => {
      calls.push({ table, op: 'update', arg: patch });
      return {
        eq: async () => {
          if (table === 'StaffUser' && script.staffRow && typeof patch === 'object' && patch) {
            Object.assign(script.staffRow, patch);
          }
          return { data: null, error: null };
        },
      };
    };
    b.insert = async (row: unknown) => {
      calls.push({ table, op: 'insert', arg: row });
      return { error: null };
    };
    return b;
  };
  return {
    script,
    calls,
    service: { from: (table: string) => builder(table) },
    anon: {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'u-1', user_metadata: {} } },
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
const req = (): VercelRequest => ({ method: 'GET', query: {}, headers: authed }) as VercelRequest;

function resetStaffRow() {
  mocks.script.staffRow = {
    id: 'u-1',
    email: 'admin@jad.local',
    name: 'Admin User',
    status: 'ACTIVE',
    mustChangePassword: false,
  };
  mocks.script.slugs = ['super_admin'];
  mocks.script.roleRows = [];
}

describe('GET /admin/session', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://sess.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    resetStaffRow();
    mocks.calls.length = 0;
  });

  it('returns the staff profile with slugs', async () => {
    const { res, seen } = capture();
    await handler(req(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      id: 'u-1',
      email: 'admin@jad.local',
      status: 'ACTIVE',
      slugs: ['super_admin'],
    });
  });

  it('resolves the system role identity (label + matrix modules)', async () => {
    const { res, seen } = capture();
    await handler(req(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      roleId: 'super_admin',
      roleName: 'Super Admin',
    });
    const modules = (seen.body as { modules?: string[] }).modules ?? [];
    expect(modules).toEqual(expect.arrayContaining(['dashboard', 'members', 'staff', 'audit', 'config']));
  });

  it('resolves a custom role identity from its record (name + modules)', async () => {
    mocks.script.slugs = ['role-admin-support'];
    mocks.script.roleRows = [
      {
        id: 'x-1',
        key: 'role-admin-support',
        slug: 'role-admin-support',
        name: 'Admin Support',
        permissions: ['dashboard', 'members'],
        is_system: false,
      },
    ];
    const { res, seen } = capture();
    await handler(req(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      slugs: ['role-admin-support'],
      roleId: 'role-admin-support',
      roleName: 'Admin Support',
      modules: ['dashboard', 'members'],
    });
  });

  it('404s callers without a staff identity', async () => {
    mocks.script.staffRow = null;
    const { res, seen } = capture();
    await handler(req(), res);
    expect(seen.status).toBe(404);
  });

  it('401s without credentials', async () => {
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: {} } as VercelRequest, res);
    expect(seen.status).toBe(401);
  });

  it('403s a disabled staff identity instead of returning a session', async () => {
    mocks.script.staffRow = {
      id: 'u-1',
      email: 'admin@jad.local',
      name: 'Admin User',
      status: 'DISABLED',
      mustChangePassword: false,
    };
    const { res, seen } = capture();
    await handler(req(), res);
    expect(seen.status).toBe(403);
  });
});

describe('PATCH /admin/session', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://sess.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    resetStaffRow();
    mocks.calls.length = 0;
  });

  it('updates the signed-in staff display name and audits', async () => {
    const { res, seen } = capture();
    await handler(
      { method: 'PATCH', query: {}, headers: authed, body: { name: 'New Name' } } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'u-1', name: 'New Name' });
    const update = mocks.calls.find((c) => c.table === 'StaffUser' && c.op === 'update');
    expect(update?.arg).toMatchObject({ name: 'New Name' });
    const audit = mocks.calls.find((c) => c.table === 'AuditLog' && c.op === 'insert');
    expect(audit?.arg).toMatchObject({ action: 'STAFF_PROFILE_UPDATED', target_id: 'u-1' });
  });

  it('rejects an empty name', async () => {
    const { res, seen } = capture();
    await handler(
      { method: 'PATCH', query: {}, headers: authed, body: { name: '   ' } } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(400);
  });

  it('returns 404 when the caller holds no staff profile', async () => {
    mocks.script.staffRow = null;
    const { res, seen } = capture();
    await handler(
      { method: 'PATCH', query: {}, headers: authed, body: { name: 'New Name' } } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(404);
  });
});
