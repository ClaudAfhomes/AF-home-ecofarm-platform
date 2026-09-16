import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import handler from './[id].js';

/**
 * PATCH /admin/inquiries/:id - triage a contact submission (staff `cms`
 * module, audited). Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; table?: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'admin',
    row: null as unknown,
    updated: null as unknown,
    updatedCalled: false,
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
    chain.maybeSingle = async () => {
      if (table === 'ContactInquiry')
        return { data: script.updatedCalled ? script.updated : script.row, error: null };
      return { data: null, error: null };
    };
    chain.update = (patch: unknown) => {
      calls.push({ op: 'update', table, arg: patch });
      script.updatedCalled = true;
      return chain;
    };
    chain.insert = (row: unknown) => {
      calls.push({ op: 'insert', table, arg: row });
      return Promise.resolve({ data: null, error: null });
    };
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffUser') {
        resolve({ data: [{ status: 'ACTIVE', mustChangePassword: false }], error: null });
      } else if (table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-admin' }], error: null });
      } else if (table === 'ContactInquiry') {
        resolve({ data: script.updated, error: null });
      } else {
        resolve({ data: [], error: null });
      }
    };
    return chain;
  };
  return {
    calls,
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

const patchReq = (body: unknown): VercelRequest =>
  ({
    method: 'PATCH',
    query: { id: 'inq-1' },
    headers: { authorization: 'Bearer good' },
    body,
  }) as VercelRequest;

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

describe('PATCH /admin/inquiries/:id', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://staff.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'admin';
    mocks.script.updatedCalled = false;
    mocks.script.row = ROW;
    mocks.script.updated = { ...ROW, status: 'READ' };
  });

  it('updates the status and audits the change', async () => {
    const { res, seen } = capture();
    await handler(patchReq({ status: 'READ' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'inq-1', status: 'READ' });
    expect(mocks.calls.find((c) => c.table === 'ContactInquiry')).toMatchObject({
      op: 'update',
    });
    expect(mocks.calls.find((c) => c.table === 'AuditLog')).toMatchObject({ op: 'insert' });
  });

  it('404s unknown ids and 400s bad statuses', async () => {
    mocks.script.row = null;
    const missing = capture();
    await handler(patchReq({ status: 'READ' }), missing.res);
    expect(missing.seen.status).toBe(404);
    mocks.script.row = ROW;
    const bad = capture();
    await handler(patchReq({ status: 'NOPE' }), bad.res);
    expect(bad.seen.status).toBe(400);
  });

  it('403s slugs without the cms module', async () => {
    mocks.script.roleSlug = 'merchant';
    const { res, seen } = capture();
    await handler(patchReq({ status: 'READ' }), res);
    expect(seen.status).toBe(403);
  });
});
