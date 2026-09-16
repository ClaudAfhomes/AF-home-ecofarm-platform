import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './inquiries.js';

/**
 * GET /admin/inquiries - Contact page submissions queue (staff `cms`
 * module). Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const script = {
    roleSlug: 'admin',
    rows: [] as unknown[],
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
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
      } else if (table === 'ContactInquiry') {
        resolve({ data: script.rows, error: null });
      } else {
        resolve({ data: [], error: null });
      }
    };
    return chain;
  };
  return {
    script,
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

const getReq = (): VercelRequest =>
  ({ method: 'GET', query: {}, headers: { authorization: 'Bearer good' } }) as VercelRequest;

const ROW = {
  id: 'inq-1',
  name: 'Maria Santos',
  email: 'maria@example.com',
  message: 'Hello, I have a question.',
  status: 'NEW',
  createdAt: '2026-09-16T10:00:00.000Z',
  handledAt: null,
  handledBy: null,
};

describe('GET /admin/inquiries', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://staff.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.roleSlug = 'admin';
    mocks.script.rows = [ROW];
  });

  it('lists inquiries newest-first for cms staff', async () => {
    const { res, seen } = capture();
    await handler(getReq(), res);
    const body = seen.body as { data: unknown[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 'inq-1', status: 'NEW' });
  });

  it('401s without credentials and 403s slugs without the cms module', async () => {
    const anon = capture();
    await handler({ method: 'GET', query: {}, headers: {} } as VercelRequest, anon.res);
    expect(anon.seen.status).toBe(401);
    mocks.script.roleSlug = 'merchant';
    const forbidden = capture();
    await handler(getReq(), forbidden.res);
    expect(forbidden.seen.status).toBe(403);
  });
});
