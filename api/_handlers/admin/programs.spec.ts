import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import listOrCreatePrograms from './programs.js';
import updateProgram from './programs/[id].js';

/**
 * Admin program management (super_admin): GET (incl. inactive), POST create,
 * PATCH retire. Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    rows: [] as unknown[],
    created: null as unknown,
    updated: null as unknown,
    insertError: null as string | null,
    updateError: null as string | null,
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
    chain.single = async () => {
      if (table === 'Program') {
        if (script.insertError) return { data: null, error: new Error(script.insertError) };
        return { data: script.updatedCalled ? script.updated : script.created, error: null };
      }
      return { data: null, error: null };
    };
    chain.insert = (row: unknown) => {
      calls.push({ table, op: 'insert', arg: row });
      return chain;
    };
    chain.update = (patch: unknown) => {
      calls.push({ table, op: 'update', arg: patch });
      script.updatedCalled = true;
      return chain;
    };
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffUser') {
        resolve({ data: [{ status: 'ACTIVE', mustChangePassword: false }], error: null });
      } else if (table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-super' }], error: null });
      } else if (table === 'Program') {
        if (script.updateError) resolve({ data: null, error: new Error(script.updateError) });
        else resolve({ data: script.rows, error: null });
      } else {
        resolve({ data: null, error: null });
      }
    };
    return chain;
  };
  return {
    calls,
    script,
    service: {
      from: (table: string) => chainFor(table),
      auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
    },
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
const req = (method: string, body?: unknown, query: Record<string, string> = {}): VercelRequest =>
  ({ method, query, headers: authed, body }) as VercelRequest;

describe('admin programs', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://staff.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'super_admin';
    mocks.script.rows = [
      { id: 'prg-domestic', code: 'DOMESTIC', name: 'Domestic Program', isActive: true },
      { id: 'prg-abroad', code: 'ABROAD', name: 'Abroad Program', isActive: false },
    ];
    mocks.script.created = {
      id: 'prg-new',
      code: 'STUDENT',
      name: 'Student Program',
      isActive: true,
    };
    mocks.script.updated = {
      id: 'prg-abroad',
      code: 'ABROAD',
      name: 'Abroad Program',
      isActive: true,
    };
    mocks.script.insertError = null;
    mocks.script.updateError = null;
    mocks.script.updatedCalled = false;
  });

  it('lists programs including inactive ones', async () => {
    const { res, seen } = capture();
    await listOrCreatePrograms(req('GET'), res);
    const body = seen.body as { data: { isActive: boolean }[] };
    expect(body.data).toHaveLength(2);
    expect(body.data.some((p) => p.isActive === false)).toBe(true);
  });

  it('creates a program and audits it', async () => {
    const { res, seen } = capture();
    await listOrCreatePrograms(req('POST', { code: 'student', name: 'Student Program' }), res);
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({ code: 'STUDENT', isActive: true });
    const insert = mocks.calls.find((c) => c.table === 'Program' && c.op === 'insert')
      ?.arg as Record<string, unknown>;
    expect(insert.code).toBe('STUDENT');
    expect(mocks.calls.some((c) => c.table === 'AuditLog' && c.op === 'insert')).toBe(true);
  });

  it('409s a duplicate program code', async () => {
    mocks.script.insertError = 'duplicate key value violates unique constraint "Program_code_key"';
    const { res, seen } = capture();
    await listOrCreatePrograms(req('POST', { code: 'DOMESTIC', name: 'Dup' }), res);
    expect(seen.status).toBe(409);
  });

  it('retires a program via PATCH isActive:false', async () => {
    mocks.script.updated = {
      id: 'prg-abroad',
      code: 'ABROAD',
      name: 'Abroad Program',
      isActive: false,
    };
    const { res, seen } = capture();
    await updateProgram(req('PATCH', { isActive: false }, { id: 'prg-abroad' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ isActive: false });
    const patch = mocks.calls.find((c) => c.table === 'Program' && c.op === 'update')
      ?.arg as Record<string, unknown>;
    expect(patch).toMatchObject({ isActive: false });
  });

  it('403s a non-super-admin slug and 401s missing credentials', async () => {
    mocks.script.roleSlug = 'admin';
    const forbidden = capture();
    await listOrCreatePrograms(req('GET'), forbidden.res);
    expect(forbidden.seen.status).toBe(403);
    const anon = capture();
    await listOrCreatePrograms(
      { method: 'GET', query: {}, headers: {} } as VercelRequest,
      anon.res,
    );
    expect(anon.seen.status).toBe(401);
  });
});
