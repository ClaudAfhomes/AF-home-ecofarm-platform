import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import listRegistrations from './registrations.js';
import listMembers from './members.js';
import { getQueues } from './queues.js';
import { listAdminWithdrawals } from './withdrawals.js';
import { listVouchers } from './vouchers.js';

/**
 * Custom-role staff access (Phase: server-side module authorization).
 * A custom role authorizes exactly the endpoints its granted modules map
 * to; system-slug behavior is preserved. The shared service fake is both
 * chainable and thenable so every PostgREST chain in these handlers
 * resolves to table-appropriate payloads.
 */
type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

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

const authedReq = (): VercelRequest =>
  ({ method: 'GET', query: {}, headers: { authorization: 'Bearer good' } }) as VercelRequest;

const mocks = vi.hoisted(() => {
  const script = {
    slugs: ['role-admin-support'] as string[],
    permissions: ['dashboard', 'members'] as string[],
  };
  const roleRows = () =>
    script.slugs.includes('role-admin-support')
      ? [
          {
            id: 'x-1',
            key: 'role-admin-support',
            slug: 'role-admin-support',
            name: 'Admin Support',
            permissions: script.permissions,
            is_system: false,
          },
        ]
      : [];
  const tableData = (table: string) => {
    if (table === 'StaffUser')
      return { data: { status: 'ACTIVE', mustChangePassword: false }, error: null };
    if (table === 'StaffAssignment') return { data: [{ roleId: 'x-1' }], error: null };
    if (table === 'Role') return { data: roleRows(), error: null };
    return { data: [], error: null, count: 0 };
  };
  const builder = (table: string) => {
    let viaIn = false;
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = () => {
      viaIn = true;
      return b;
    };
    b.is = () => b;
    b.order = () => b;
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'Role' && viaIn)
        return resolve({ data: script.slugs.map((slug) => ({ slug })), error: null });
      return resolve(tableData(table));
    };
    return b;
  };
  return {
    script,
    service: { from: (table: string) => builder(table) },
    anon: {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'u-9', user_metadata: {} } },
          error: null,
        }),
      },
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => (key === 'service' ? mocks.service : mocks.anon),
}));

describe('custom-role staff access (module authorization)', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://custom.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.slugs = ['role-admin-support'];
    mocks.script.permissions = ['dashboard', 'members'];
  });

  it('authorizes a granted module (members)', async () => {
    const { res, seen } = capture();
    await listMembers(authedReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ data: [] });
  });

  it('denies an ungranted module (members without it)', async () => {
    mocks.script.permissions = ['dashboard'];
    const { res, seen } = capture();
    await listMembers(authedReq(), res);
    expect(seen.status).toBe(403);
  });

  it('authorizes the dashboard queue counts', async () => {
    const { res, seen } = capture();
    await getQueues(authedReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      registrations: 0,
      sales: 0,
      members: 0,
      withdrawals: 0,
    });
  });

  it('authorizes the registrations queue', async () => {
    mocks.script.permissions = ['dashboard', 'registrations'];
    const { res, seen } = capture();
    await listRegistrations(authedReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ data: [] });
  });

  it('authorizes withdrawals when granted', async () => {
    mocks.script.permissions = ['withdrawals'];
    const { res, seen } = capture();
    await listAdminWithdrawals(authedReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ data: [] });
  });

  it('authorizes vouchers when granted', async () => {
    mocks.script.permissions = ['vouchers'];
    const { res, seen } = capture();
    await listVouchers(authedReq(), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ data: [] });
  });

  it('keeps system-slug access intact (admin on members)', async () => {
    mocks.script.slugs = ['admin'];
    mocks.script.permissions = [];
    const { res, seen } = capture();
    await listMembers(authedReq(), res);
    expect(seen.status).toBe(200);
  });
});
