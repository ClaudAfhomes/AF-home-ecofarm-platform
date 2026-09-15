import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../../_lib/http.js';

import approveHandler from './approve.js';

/**
 * POST /admin/registrations/:id/approve — approval moves the application to
 * the Member domain: the Registration row is DELETED (registrations are
 * PENDING | REJECTED only; APPROVED_ACTIVE lives on Member).
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    registration: null as unknown,
    createUserResult: { data: { user: { id: 'mem-auth-1' } }, error: null } as {
      data: { user?: { id: string } };
      error: unknown;
    },
    listedUsers: [] as { id: string; email?: string; phone?: string }[],
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = async (key: string) => {
      // Staff gate (queryStaffSlugs) looks up Role by id; approval grants
      // member roles looked up by slug — same table, different query.
      if (table === 'Role' && key === 'id') return { data: [{ slug: 'super_admin' }], error: null };
      if (table === 'Role' && key === 'slug')
        return {
          data: [
            { id: 'role-basic', slug: 'member_basic' },
            { id: 'role-qualified', slug: 'member_qualified' },
          ],
          error: null,
        };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => {
      if (table === 'Registration') return { data: script.registration, error: null };
      return { data: null, error: null };
    };
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffAssignment') resolve({ data: [{ roleId: 'r-1' }], error: null });
      else resolve({ data: null, error: null });
    };
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
      delete: () => ({
        eq: async (column: string, value: unknown) => {
          calls.push({ table, op: 'delete', arg: { [column]: value } });
          return { error: null };
        },
      }),
    };
  };
  return {
    calls,
    script,
    service: {
      from: (table: string) => builder(table),
      auth: {
        admin: {
          createUser: async (input: unknown) => {
            calls.push({ table: 'auth.users', op: 'createUser', arg: input });
            return script.createUserResult;
          },
          updateUserById: async () => ({ error: null }),
          listUsers: async () => ({ data: { users: script.listedUsers }, error: null }),
        },
      },
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

const approveReq = (id: string): VercelRequest =>
  ({ method: 'POST', query: { id }, headers: { authorization: 'Bearer good' }, body: {} }) as VercelRequest;

function pendingRegistration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-001',
    status: 'PENDING',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    email: 'juan@example.com',
    phone: '+639171234567',
    dateOfBirth: '1990-01-01',
    gender: 'Male',
    countryCode: 'PH',
    countryName: 'Philippines',
    programId: 'prg-domestic',
    programCode: 'DOMESTIC',
    referralCode: null,
    qualificationAnswers: [],
    governmentId: null,
    ...overrides,
  };
}

describe('POST /admin/registrations/:id/approve', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://a.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.registration = pendingRegistration();
    mocks.script.createUserResult = { data: { user: { id: 'mem-auth-1' } }, error: null };
    mocks.script.listedUsers = [];
  });

  it('404s a missing registration', async () => {
    mocks.script.registration = null;
    const { res, seen } = capture();
    await approveHandler(approveReq('reg-missing'), res);
    expect(seen.status).toBe(404);
  });

  it('409s a non-PENDING registration', async () => {
    mocks.script.registration = pendingRegistration({ status: 'REJECTED' });
    const { res, seen } = capture();
    await approveHandler(approveReq('reg-001'), res);
    expect(seen.status).toBe(409);
  });

  it('deletes the registration row on approve (member owns the identity)', async () => {
    const { res, seen } = capture();
    await approveHandler(approveReq('reg-001'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'reg-001', memberId: 'mem-auth-1' });
    const deletion = mocks.calls.find(
      (c) => c.table === 'Registration' && c.op === 'delete',
    );
    expect(deletion?.arg).toEqual({ id: 'reg-001' });
    // No APPROVED_ACTIVE registration row is ever written back.
    const updates = mocks.calls.filter(
      (c) => c.table === 'Registration' && c.op === 'update',
    );
    expect(updates.length).toBe(0);
    // The member itself is still created with its own active status.
    const member = mocks.calls.find((c) => c.table === 'Member' && c.op === 'upsert')
      ?.arg as Record<string, unknown>;
    expect(member).toMatchObject({ id: 'mem-auth-1', status: 'APPROVED_ACTIVE' });
  });

  it('adopts an existing auth account whose email case differs from the registration', async () => {
    // GoTrue stores emails lowercased and matches case-insensitively on
    // createUser (so it conflicts), but the registration row can carry the
    // original casing. Adoption must resolve the identity anyway.
    mocks.script.registration = pendingRegistration({ email: 'Juan.DelaCruz@Example.COM' });
    mocks.script.createUserResult = {
      data: {},
      error: new Error('A user with this email address has already been registered'),
    };
    mocks.script.listedUsers = [{ id: 'mem-auth-1', email: 'juan.delacruz@example.com' }];

    const { res, seen } = capture();
    await approveHandler(approveReq('reg-001'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'reg-001', memberId: 'mem-auth-1' });
  });

  it('returns an actionable conflict when the auth identity is genuinely unresolvable', async () => {
    mocks.script.registration = pendingRegistration({ email: 'ghost@example.com' });
    mocks.script.createUserResult = {
      data: {},
      error: new Error('A user with this email address has already been registered'),
    };
    mocks.script.listedUsers = [{ id: 'other-1', email: 'someone@else.com' }];

    const { res, seen } = capture();
    await approveHandler(approveReq('reg-001'), res);
    expect(seen.status).toBe(409);
    expect(seen.body).toMatchObject({
      error: { code: 'AUTH_IDENTITY_UNRESOLVABLE' },
    });
  });
});
