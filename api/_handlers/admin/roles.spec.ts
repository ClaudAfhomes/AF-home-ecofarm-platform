import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STAFF_PERMISSIONS } from '@jad/contracts';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import rolesHandler from './roles.js';

/**
 * GET /admin/roles must surface the canonical system roles even when the
 * stored `permissions` array is empty (e.g. a seed/provision that created the
 * row without permissions). The matrix seed is authoritative for system
 * roles; without it the admin shell's role selects render empty.
 */
const mocks = vi.hoisted(() => {
  const roleRows: Record<string, unknown>[] = [];
  const script = { inserts: [] as { table: string; row: Record<string, unknown> }[] };
  return { roleRows, script };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => {
    const svc = {
      from: (table: string) => {
        const b: Record<string, (...a: never[]) => unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.order = () => b;
        b.limit = () => b;
        b.insert = (row: unknown) => {
          mocks.script.inserts.push({ table, row: row as Record<string, unknown> });
          return b;
        };
        b.single = async () => {
          if (table === 'Role') {
            const latest = [...mocks.script.inserts]
              .reverse()
              .find((i) => i.table === 'Role');
            if (latest) {
              const created = { ...latest.row, id: 'uuid-new' };
              mocks.roleRows.push(created);
              return { data: created, error: null };
            }
          }
          return { data: null, error: new Error('no rows') };
        };
        b.in = async () => {
          if (table === 'Role') return { data: [{ slug: 'super_admin' }], error: null };
          return { data: [], error: null };
        };
        b.then = (resolve: (v: unknown) => void) => {
          if (table === 'StaffAssignment') {
            resolve({ data: [{ roleId: 'r-1' }], error: null });
          } else if (table === 'Role') {
            resolve({ data: mocks.roleRows, error: null });
          } else {
            resolve({ data: [], error: null });
          }
        };
        return b;
      },
    };
    if (key === 'service') return svc;
    return {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'staff-uuid-1', user_metadata: {} } },
          error: null,
        }),
      },
    };
  },
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

describe('GET /admin/roles', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://fix.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.roleRows.length = 0;
    mocks.script.inserts.length = 0;
  });

  it('returns a system role with matrix permissions when the stored array is empty', async () => {
    mocks.roleRows.push({
      id: 'uuid-admin',
      key: 'admin',
      slug: 'admin',
      name: 'Admin',
      permissions: [],
      is_system: true,
      domain: 'staff',
    });
    const { res, seen } = capture();
    await rolesHandler(
      { method: 'GET', query: {}, headers: authed, body: null } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const data = (seen.body as { data: { id: string; permissions: string[] }[] }).data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ id: 'admin', name: 'Admin' });
    expect(data[0]!.permissions).toEqual([...STAFF_PERMISSIONS['admin']]);
  });

  it('keeps stored permissions when the row already grants modules', async () => {
    mocks.roleRows.push({
      id: 'uuid-fin',
      key: 'finance',
      slug: 'finance',
      name: 'Finance',
      permissions: ['dashboard', 'sales'],
      is_system: true,
      domain: 'staff',
    });
    const { res, seen } = capture();
    await rolesHandler(
      { method: 'GET', query: {}, headers: authed, body: null } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const data = (seen.body as { data: { id: string; permissions: string[] }[] }).data;
    expect(data).toHaveLength(1);
    expect(data[0]!.permissions).toEqual(['dashboard', 'sales']);
  });
});

describe('POST /admin/roles', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://fix.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.roleRows.length = 0;
    mocks.script.inserts.length = 0;
  });

  const post = (body: unknown) => {
    const { res, seen } = capture();
    return rolesHandler(
      { method: 'POST', query: {}, headers: authed, body } as VercelRequest,
      res,
    ).then(() => seen);
  };

  it('creates a custom role with operational modules', async () => {
    const { res, seen } = capture();
    await rolesHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: { name: 'Admin Support', permissions: ['dashboard', 'members'] },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({ id: 'role-admin-support', name: 'Admin Support' });
    const roleInsert = mocks.script.inserts.find((i) => i.table === 'Role');
    expect(roleInsert?.row).toMatchObject({ key: 'role-admin-support', is_system: false });
  });

  it('rejects governance modules on new custom roles', async () => {
    const { res, seen } = capture();
    await rolesHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: { name: 'Shadow Admin', permissions: ['dashboard', 'staff'] },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(400);
    const message = (seen.body as { error: { message: string } }).error.message;
    expect(message).toMatch(/cannot hold/i);
    expect(mocks.script.inserts).toHaveLength(0);
  });

  it('rejects config/audit/programs on new custom roles', async () => {
    for (const module of ['audit', 'config', 'programs']) {
      const seen = await post({ name: `Role ${module}`, permissions: ['dashboard', module] });
      expect(seen.status).toBe(400);
    }
    expect(mocks.script.inserts).toHaveLength(0);
  });
});
