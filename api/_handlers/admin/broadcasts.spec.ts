import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './broadcasts.js';

/** GET /admin/broadcasts - broadcast announcements for the composer. Supabase is fully mocked. */
const mocks = vi.hoisted(() => {
  const calls: { op: string; table?: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'admin',
    rows: [] as unknown[],
    listError: null as string | null,
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.or = () => chain;
    chain.is = () => chain;
    chain.order = () => chain;
    chain.in = async (key: string) => {
      if (table === 'Role' && key === 'id')
        return { data: [{ slug: script.roleSlug }], error: null };
      return { data: [], error: null };
    };
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffUser') {
        resolve({ data: [{ status: 'ACTIVE', mustChangePassword: false }], error: null });
      } else if (table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-admin' }], error: null });
      } else if (table === 'Notification') {
        resolve({
          data: script.rows,
          error: script.listError ? new Error(script.listError) : null,
        });
      } else {
        resolve({ data: [], error: null });
      }
    };
    return chain;
  };
  return {
    calls,
    script,
    setRoleSlug: (slug: string) => {
      script.roleSlug = slug;
    },
    service: { from: (table: string) => chainFor(table) },
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

describe('GET /admin/broadcasts', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://staff.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.setRoleSlug('admin');
    mocks.script.rows = [
      {
        id: 'ntf-001',
        title: 'Welcome',
        body: 'Hello members.',
        read_at: null,
        created_at: '2026-09-14T10:00:00.000Z',
      },
    ];
    mocks.script.listError = null;
  });

  it('401s without credentials and 403s non-staff slugs', async () => {
    const anon = capture();
    await handler({ method: 'GET', query: {}, headers: {} } as VercelRequest, anon.res);
    expect(anon.seen.status).toBe(401);

    mocks.setRoleSlug('merchant');
    const merchant = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, merchant.res);
    expect(merchant.seen.status).toBe(403);
  });

  it('200s the broadcast list', async () => {
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ data: [{ id: 'ntf-001', title: 'Welcome' }] });
  });

  it('500s when the list read fails', async () => {
    mocks.script.listError = 'db down';
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(500);
  });
});
