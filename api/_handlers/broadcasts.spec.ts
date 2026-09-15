import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../_lib/http.js';

import handler from './broadcasts.js';

/**
 * POST /broadcasts — admin announcement to all members (FEAT-063). Broadcasts
 * land as Notification rows with member_id NULL; per-member read state stays
 * in NotificationRead so the shared row is never marked read. Supabase is
 * fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; table?: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'admin',
    insertedRow: null as unknown,
    insertError: null as string | null,
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
    chain.maybeSingle = async () => ({ data: null, error: null });
    chain.single = async () => {
      if (table === 'Notification' && script.insertedRow)
        return { data: script.insertedRow, error: null };
      return { data: null, error: script.insertError ? new Error(script.insertError) : null };
    };
    chain.insert = (row: unknown) => {
      calls.push({ op: 'insert', table, arg: row });
      if (table === 'Notification' && script.insertError) {
        return { error: new Error(script.insertError), select: () => ({ single: chain.single }) };
      }
      return { error: null, select: () => ({ single: chain.single }) };
    };
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffUser') {
        resolve({ data: [{ status: 'ACTIVE', mustChangePassword: false }], error: null });
      } else if (table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-admin' }], error: null });
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
const postReq = (body: unknown): VercelRequest =>
  ({ method: 'POST', query: {}, headers: authed, body }) as VercelRequest;

const CREATED_ROW = {
  id: 'ntf-new',
  member_id: null,
  title: 'Downtime Sunday',
  body: 'Maintenance 02:00-04:00.',
  read_at: null,
  created_at: '2026-09-14T10:00:00.000Z',
};

describe('POST /broadcasts', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://staff.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.setRoleSlug('admin');
    mocks.script.insertedRow = CREATED_ROW;
    mocks.script.insertError = null;
  });

  it('401s without credentials and 403s non-staff slugs', async () => {
    const anon = capture();
    await handler(
      { method: 'POST', query: {}, headers: {}, body: { title: 'Hi' } } as VercelRequest,
      anon.res,
    );
    expect(anon.seen.status).toBe(401);

    mocks.setRoleSlug('member_basic');
    const member = capture();
    await handler(postReq({ title: 'Hi' }), member.res);
    expect(member.seen.status).toBe(403);
  });

  it('400s a missing title and rejects other methods', async () => {
    const empty = capture();
    await handler(postReq({ title: '' }), empty.res);
    expect(empty.seen.status).toBe(400);

    const missing = capture();
    await handler(postReq({}), missing.res);
    expect(missing.seen.status).toBe(400);

    const get = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, get.res);
    expect(get.seen.status).toBe(405);
  });

  it('201s a broadcast row with member_id NULL and audits it', async () => {
    const { res, seen } = capture();
    await handler(postReq({ title: 'Downtime Sunday', body: 'Maintenance 02:00-04:00.' }), res);
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({ id: 'ntf-new', title: 'Downtime Sunday' });
    const insert = mocks.calls.find((c) => c.op === 'insert' && c.table === 'Notification')
      ?.arg as Record<string, unknown>;
    expect(insert).toMatchObject({ member_id: null, title: 'Downtime Sunday' });
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(audit).toMatchObject({ action: 'BROADCAST_CREATED' });
  });

  it('500s when the insert fails', async () => {
    mocks.script.insertedRow = null;
    mocks.script.insertError = 'db down';
    const { res, seen } = capture();
    await handler(postReq({ title: 'Downtime Sunday' }), res);
    expect(seen.status).toBe(500);
  });
});
