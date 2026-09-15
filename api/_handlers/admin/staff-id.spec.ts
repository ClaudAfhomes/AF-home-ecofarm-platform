import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './staff/[id].js';

/**
 * DELETE/PATCH /admin/staff/:id on the Phase-1 staff domain: deletes remove
 * StaffUser (+ assignments + auth account) and never touch Member rows;
 * status writes go to StaffUser.status; role changes replace StaffAssignment.
 * Supabase is fully mocked.
 */
const STAFF_USERS = [
  {
    id: 'staff-admin-1',
    email: 'saul@jad.example',
    name: 'Saul Super',
    status: 'ACTIVE',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'staff-admin-2',
    email: 'ada@jad.example',
    name: 'Ada Admin',
    status: 'ACTIVE',
    createdAt: '2026-08-02T00:00:00.000Z',
  },
];

const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.or = () => b;
    b.in = async () => {
      if (table === 'Role') return { data: [{ slug: 'super_admin' }], error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => ({ data: null, error: null });
    b.single = async () => ({ data: null, error: null });
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffAssignment') {
        resolve({
          data: [
            { staffUserId: 'staff-admin-1', roleId: 'r-super' },
            { staffUserId: 'staff-admin-2', roleId: 'r-admin' },
          ],
          error: null,
        });
      } else if (table === 'StaffUser') resolve({ data: STAFF_USERS, error: null });
      else if (table === 'MemberRole') resolve({ data: [], error: null });
      else if (table === 'Role') {
        resolve({
          data: [
            {
              id: 'r-super',
              key: 'super_admin',
              slug: 'super_admin',
              name: 'Super Admin',
              permissions: ['staff'],
              is_system: true,
            },
            {
              id: 'r-admin',
              key: 'admin',
              slug: 'admin',
              name: 'Admin',
              permissions: ['dashboard'],
              is_system: true,
            },
          ],
          error: null,
        });
      } else resolve({ data: [], error: null });
    };
    const chainableEq = () => ({
      eq: () => ({
        eq: async () => ({ error: null }),
        select: () => ({ single: async () => ({ data: null, error: null }) }),
      }),
    });
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
        return { eq: async () => ({ error: null }) };
      },
      delete: () => {
        calls.push({ table, op: 'delete' });
        return { eq: chainableEq().eq };
      },
    };
  };
  return {
    calls,
    service: { from: (table: string) => builder(table) },
    anon: {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'staff-admin-1', user_metadata: {} } },
          error: null,
        }),
      },
    },
    adminAuth: {
      deleteUser: async (id: unknown) => {
        calls.push({ table: 'auth.users', op: 'deleteUser', arg: id });
        return { error: null };
      },
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => {
    if (key === 'service') {
      const svc = mocks.service as { from: (t: string) => unknown };
      return { ...svc, auth: { admin: mocks.adminAuth } };
    }
    return mocks.anon;
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
const req = (method: string, id: string, body?: unknown): VercelRequest =>
  ({ method, query: { id }, headers: authed, body }) as VercelRequest;

describe('DELETE /admin/staff/:id', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://staff.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
  });

  it('deletes assignments + staff row + auth user without touching Member', async () => {
    const { res, seen } = capture();
    await handler(req('DELETE', 'staff-admin-2'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ id: 'staff-admin-2', deleted: true });
    expect(mocks.calls.some((c) => c.table === 'StaffAssignment' && c.op === 'delete')).toBe(true);
    expect(mocks.calls.some((c) => c.table === 'StaffUser' && c.op === 'delete')).toBe(true);
    expect(mocks.calls.some((c) => c.table === 'auth.users')).toBe(true);
    expect(mocks.calls.some((c) => c.table === 'Member')).toBe(false);
  });

  it('refuses self-delete', async () => {
    const { res, seen } = capture();
    await handler(req('DELETE', 'staff-admin-1'), res);
    expect(seen.status).toBe(409);
  });
});

describe('PATCH /admin/staff/:id', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://staff.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
  });

  it('writes status to StaffUser, not Member', async () => {
    const { res, seen } = capture();
    await handler(req('PATCH', 'staff-admin-2', { status: 'DISABLED' }), res);
    expect(seen.status).toBe(200);
    const update = mocks.calls.find((c) => c.table === 'StaffUser' && c.op === 'update')
      ?.arg as Record<string, unknown>;
    expect(update).toMatchObject({ status: 'DISABLED' });
    expect(mocks.calls.some((c) => c.table === 'Member')).toBe(false);
  });
});
