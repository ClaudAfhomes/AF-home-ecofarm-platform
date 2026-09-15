import { beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyStaff } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import sessionHandler from './session.js';
import passwordHandler from './session/password.js';

/**
 * Post-login staff cross-check: a temporary-password holder must see the
 * flag on their session, be blocked from admin data until they change it,
 * and be unblocked afterwards. Exercises GET /admin/session,
 * POST /admin/session/password, and verifyStaff against one shared mock DB.
 */
const db = vi.hoisted(() => ({
  staff: {
    id: 'staff-1',
    email: 'temp.staff@jad.example',
    name: 'Temp Staff',
    status: 'ACTIVE',
    mustChangePassword: true,
  } as Record<string, unknown>,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => {
    const table = (name: string) => {
      const b: Record<string, (...a: never[]) => unknown> = {};
      b.select = () => b;
      b.eq = () => {
        const rows =
          name === 'StaffUser' ? [db.staff] : name === 'StaffAssignment' ? [{ roleId: 'r-1' }] : [];
        const result = { data: rows, error: null };
        return {
          then: (resolve: (v: unknown) => void) => resolve(result),
          maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        };
      };
      b.in = async () => {
        if (name === 'Role') return { data: [{ slug: 'admin' }], error: null };
        return { data: [], error: null };
      };
      b.update = (patch: unknown) => ({
        eq: async () => {
          if (name === 'StaffUser' && typeof patch === 'object' && patch) {
            Object.assign(db.staff, patch);
          }
          return { data: null, error: null };
        },
      });
      b.insert = async () => ({ error: null });
      return b;
    };
    if (key === 'service') {
      return {
        from: table,
        auth: {
          admin: {
            updateUserById: async () => ({ data: { user: { id: 'staff-1' } }, error: null }),
          },
        },
      };
    }
    return {
      from: table,
      auth: {
        getUser: async () => ({
          data: { user: { id: 'staff-1', user_metadata: {} } },
          error: null,
        }),
        signInWithPassword: async () => ({ data: { user: { id: 'staff-1' } }, error: null }),
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
const req = (method: string, body?: unknown): VercelRequest =>
  ({ method, query: {}, headers: authed, body }) as VercelRequest;

describe('post-login temporary-password flow', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://fix.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    db.staff = {
      id: 'staff-1',
      email: 'temp.staff@jad.example',
      name: 'Temp Staff',
      status: 'ACTIVE',
      mustChangePassword: true,
    };
  });

  it('flags the session, blocks admin data, unlocks after the change', async () => {
    // 1. Session surfaces the flag.
    {
      const { res, seen } = capture();
      await sessionHandler(req('GET'), res);
      expect(seen.status).toBe(200);
      expect(seen.body).toMatchObject({ id: 'staff-1', mustChangePassword: true });
    }

    // 2. Admin data is blocked while flagged.
    {
      const { createClient } = await import('@supabase/supabase-js');
      const anon = createClient('https://fix.test.supabase.co', 'anon');
      const svc = createClient('https://fix.test.supabase.co', 'service');
      const blocked = await verifyStaff(req('GET'), ['admin'], {
        anonClient: anon as never,
        serviceClient: svc as never,
      });
      expect('error' in blocked && blocked.error.status).toBe(403);
    }

    // 3. Changing the password clears the flag.
    {
      const { res, seen } = capture();
      await passwordHandler(
        req('POST', { currentPassword: 'TempPass1', newPassword: 'NewPass12' }),
        res,
      );
      expect(seen.status).toBe(200);
      expect(db.staff.mustChangePassword).toBe(false);
    }

    // 4. Admin data is allowed after the change.
    {
      const { createClient } = await import('@supabase/supabase-js');
      const anon = createClient('https://fix.test.supabase.co', 'anon');
      const svc = createClient('https://fix.test.supabase.co', 'service');
      const allowed = await verifyStaff(req('GET'), ['admin'], {
        anonClient: anon as never,
        serviceClient: svc as never,
      });
      expect(allowed).toEqual({ userId: 'staff-1', slugs: ['admin'] });
    }
  });
});
