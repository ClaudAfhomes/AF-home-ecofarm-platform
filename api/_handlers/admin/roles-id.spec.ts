import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import roleById from './roles/[id].js';

/**
 * PATCH /admin/roles/:id - governance modules (staff/audit/config/programs)
 * are rejected when the target is a custom role; system roles keep their
 * full matrix. The service fake serves both the auth chains and findRole's
 * maybeSingle lookup.
 */
const customRow = {
  id: 'x-1',
  key: 'role-admin-support',
  slug: 'role-admin-support',
  name: 'Admin Support',
  permissions: ['dashboard', 'members'],
  is_system: false,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => {
    if (key !== 'service') {
      return {
        auth: {
          getUser: async () => ({
            data: { user: { id: 'staff-uuid-1', user_metadata: {} } },
            error: null,
          }),
        },
      };
    }
    const eqChain = (table: string) => {
      const b: Record<string, unknown> = {};
      b.maybeSingle = async () =>
        table === 'Role' ? { data: customRow, error: null } : { data: null, error: null };
      b.then = (resolve: (v: unknown) => void) => {
        if (table === 'StaffAssignment') resolve({ data: [{ roleId: 'x-1' }], error: null });
        else resolve({ data: [], error: null });
      };
      return b;
    };
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () => eqChain(table),
          in: async () =>
            table === 'Role'
              ? { data: [{ slug: 'super_admin' }], error: null }
              : { data: [], error: null },
        }),
      }),
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

describe('PATCH /admin/roles/:id', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://rolesid.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
  });

  it('rejects adding a governance module to a custom role', async () => {
    const { res, seen } = capture();
    await roleById(
      {
        method: 'PATCH',
        query: { id: 'role-admin-support' },
        headers: authed,
        body: { permissions: ['dashboard', 'members', 'audit'] },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(400);
    const message = (seen.body as { error: { message: string } }).error.message;
    expect(message).toMatch(/cannot hold/i);
  });

  it('rejects nothing-to-update cleanly (control)', async () => {
    const { res, seen } = capture();
    await roleById(
      {
        method: 'PATCH',
        query: { id: 'role-admin-support' },
        headers: authed,
        body: {},
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(400);
  });
});
