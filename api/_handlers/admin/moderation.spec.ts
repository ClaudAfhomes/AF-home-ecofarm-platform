import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import approveRegistration from './registrations/[id]/approve.js';
import rejectRegistration from './registrations/[id]/reject.js';
import createMember from './members.js';

/**
 * Moderation write contracts (bugfix): approve provisions from the
 * phone-based registration identity, reject returns the full row, and
 * member creation returns the full validated member — the client validates
 * all three against full schemas, so partial shapes used to fail parsing
 * AFTER a successful write.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    registration: null as unknown,
    updatedRegistration: null as unknown,
    registrationReads: 0,
    memberList: null as unknown,
    existingMembers: [] as unknown[],
    createdAuthId: 'auth-uuid-1' as string | null,
    createError: null as { message: string; code?: string } | null,
    confirmError: null as { message: string } | null,
    listedUsers: [] as { id: string; email?: string; phone?: string }[],
    memberRow: null as unknown,
    programs: [{ id: 'prg-domestic', code: 'DOMESTIC', name: 'Domestic Program' }],
    memberUpsertErrors: [] as { message: string; code?: string }[],
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.limit = async () => {
      if (table === 'Member') return { data: script.existingMembers, error: null };
      if (table === 'Role') return { data: [{ id: 'role-basic' }], error: null };
      return { data: [], error: null };
    };
    b.order = async () => ({ data: [], error: null });
    b.in = async (key: string) => {
      if (table === 'Role' && key === 'slug')
        return {
          data: [
            { id: 'role-basic', slug: 'member_basic' },
            { id: 'role-qualified', slug: 'member_qualified' },
          ],
          error: null,
        };
      if (table === 'Role') return { data: [{ slug: script.roleSlug }], error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        return { data: [{ roleId: 'r-1' }], error: null };
      }
      // First Registration read sees the current row; later reads (after the
      // status update) see the updated row — mirrors read-your-write.
      if (table === 'Registration') {
        script.registrationReads += 1;
        const data =
          script.registrationReads === 1
            ? script.registration
            : (script.updatedRegistration ?? script.registration);
        return { data, error: null };
      }
      if (table === 'Member') return { data: script.memberRow, error: null };
      return { data: null, error: null };
    };
    b.single = async () => ({ data: null, error: null });
    // Bare awaited chains resolve link rows for auth, sponsor scans for
    // approval linkage, and null otherwise.
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-1' }], error: null });
      } else if (table === 'Member') resolve({ data: script.memberList ?? null, error: null });
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
        if (table === 'Member' && script.memberUpsertErrors.length > 0) {
          return { error: script.memberUpsertErrors.shift() };
        }
        return { error: null };
      },
      update: (patch: unknown) => {
        calls.push({ table, op: 'update', arg: patch });
        return { eq: async () => ({ error: null }) };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    };
  };
  return {
    calls,
    script,
    service: { from: (table: string) => builder(table) },
    anon: {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'staff-uuid-1', user_metadata: {} } },
          error: null,
        }),
      },
    },
    adminAuth: {
      createUser: async (input: unknown) => {
        calls.push({ table: 'auth.users', op: 'createUser', arg: input });
        if (script.createError) return { data: {}, error: script.createError };
        if (script.createdAuthId)
          return { data: { user: { id: script.createdAuthId } }, error: null };
        return { data: {}, error: new Error('signup disabled') };
      },
      updateUserById: async (id: string, attributes: unknown) => {
        calls.push({ table: 'auth.users', op: 'updateUserById', arg: { id, attributes } });
        if (script.confirmError) return { data: {}, error: script.confirmError };
        return { data: { user: { id } }, error: null };
      },
      listUsers: async () => ({ data: { users: script.listedUsers } }),
      getUserById: async () => ({ data: { user: null } }),
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => {
    if (key === 'service') {
      const svc = mocks.service as {
        from: (t: string) => Record<string, (...a: never[]) => unknown>;
        auth?: unknown;
      };
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

const PHONE_REGISTRATION = {
  id: 'reg-001',
  status: 'PENDING',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  phone: '+639171234567',
  dateOfBirth: '1990-01-01',
  gender: 'Male',
  countryCode: 'PH',
  countryName: 'Philippines',
  address: 'Manila',
  programId: 'prg-domestic',
  programCode: 'DOMESTIC',
  referralCode: null,
  qualificationAnswers: [],
  governmentId: { fileName: 'juan_id.pdf', mimeType: 'application/pdf', sizeBytes: 245760 },
  submittedAt: '2026-08-01T00:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('POST /admin/registrations/:id/approve', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://fix.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.registrationReads = 0;
    mocks.script.memberList = null;
    mocks.script.registration = PHONE_REGISTRATION;
    mocks.script.updatedRegistration = null;
    mocks.script.createdAuthId = 'auth-uuid-1';
    mocks.script.createError = null;
    mocks.script.confirmError = null;
    mocks.script.listedUsers = [];
    mocks.script.memberUpsertErrors = [];
  });

  it('422s when the registration has neither email nor phone', async () => {
    mocks.script.registration = { ...PHONE_REGISTRATION, phone: null };
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(422);
    expect(mocks.calls.some((c) => c.op === 'createUser')).toBe(false);
  });

  it('provisions by phone and stores a placeholder member email', async () => {
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const createCall = mocks.calls.find((c) => c.op === 'createUser')?.arg as Record<
      string,
      unknown
    >;
    expect(createCall.phone).toBe('+639171234567');
    expect(createCall.email).toBeUndefined();
    const memberUpsert = mocks.calls.find((c) => c.table === 'Member' && c.op === 'upsert')
      ?.arg as Record<string, unknown>;
    expect(memberUpsert.email).toBe('639171234567@phone.invalid');
    expect(memberUpsert.dateOfBirth).toBe('1990-01-01');
    // Fresh creates confirm at createUser, and approve re-confirms the
    // identity before any Member write (idempotent, authoritative).
    const confirmCall = mocks.calls.find((c) => c.op === 'updateUserById')?.arg as {
      id: string;
      attributes: Record<string, unknown>;
    };
    expect(confirmCall.id).toBe('auth-uuid-1');
    expect(confirmCall.attributes).toEqual({ phone_confirm: true });
    expect(seen.body).toMatchObject({
      id: 'reg-001',
      status: 'APPROVED_ACTIVE',
      memberId: 'auth-uuid-1',
    });
  });

  it('grants Active + Qualified on approval (status, flag, and qualified role)', async () => {
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const memberUpsert = mocks.calls.find((c) => c.table === 'Member' && c.op === 'upsert')
      ?.arg as Record<string, unknown>;
    expect(memberUpsert).toMatchObject({ status: 'APPROVED_ACTIVE', isQualified: true });
    const roleLinks = mocks.calls
      .filter((c) => c.table === 'MemberRole' && c.op === 'upsert')
      .map((c) => (c.arg as { roleId: string }).roleId);
    expect(roleLinks).toContain('role-basic');
    expect(roleLinks).toContain('role-qualified');
  });

  it('links the sponsor from the registration referral code', async () => {
    mocks.script.memberList = [
      {
        id: 'sponsor-uuid',
        referralCode: 'JD-2026-001',
        accountStatus: 'ACTIVE',
        isQualified: true,
      },
    ];
    mocks.script.registration = { ...PHONE_REGISTRATION, referralCode: 'jd-2026-001' };
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const memberUpsert = mocks.calls.find((c) => c.table === 'Member' && c.op === 'upsert')
      ?.arg as Record<string, unknown>;
    expect(memberUpsert.sponsorId).toBe('sponsor-uuid');
  });

  it('generates a fresh member code instead of copying the sponsor code', async () => {
    mocks.script.memberList = [
      {
        id: 'sponsor-uuid',
        referralCode: 'JD-2026-001',
        accountStatus: 'ACTIVE',
        isQualified: true,
      },
    ];
    mocks.script.registration = { ...PHONE_REGISTRATION, referralCode: 'jd-2026-001' };
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const memberUpsert = mocks.calls.find((c) => c.table === 'Member' && c.op === 'upsert')
      ?.arg as Record<string, unknown>;
    expect(typeof memberUpsert.referralCode).toBe('string');
    expect(String(memberUpsert.referralCode).toLowerCase()).not.toBe('jd-2026-001');
    expect(String(memberUpsert.referralCode)).toMatch(/^JAD-/);
  });

  it('does not link an unqualified sponsor', async () => {
    mocks.script.memberList = [
      {
        id: 'sponsor-uuid',
        referralCode: 'JD-2026-001',
        accountStatus: 'ACTIVE',
        isQualified: false,
      },
    ];
    mocks.script.registration = { ...PHONE_REGISTRATION, referralCode: 'jd-2026-001' };
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const memberUpsert = mocks.calls.find((c) => c.table === 'Member' && c.op === 'upsert')
      ?.arg as Record<string, unknown>;
    expect(memberUpsert.sponsorId).toBeNull();
  });

  it('retries once on a referral-code race then succeeds', async () => {
    mocks.script.memberList = [];
    mocks.script.memberUpsertErrors = [
      { message: 'duplicate key value violates unique constraint "Member_referralCode_uidx"' },
    ];
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const memberUpserts = mocks.calls.filter((c) => c.table === 'Member' && c.op === 'upsert');
    expect(memberUpserts).toHaveLength(2);
  });

  it('returns a safe CONFLICT when the code still collides', async () => {
    mocks.script.memberList = [];
    mocks.script.memberUpsertErrors = [
      { message: 'duplicate key value violates unique constraint "Member_referralCode_uidx"' },
      { message: 'duplicate key value violates unique constraint "Member_referralCode_uidx"' },
    ];
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(409);
    expect(seen.body).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(JSON.stringify(seen.body)).not.toContain('Member_referralCode_uidx');
  });

  it('approves without a sponsor when the code is unresolvable', async () => {
    mocks.script.memberList = [];
    mocks.script.registration = { ...PHONE_REGISTRATION, referralCode: 'NOPE' };
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const memberUpsert = mocks.calls.find((c) => c.table === 'Member' && c.op === 'upsert')
      ?.arg as Record<string, unknown>;
    expect(memberUpsert.sponsorId).toBeNull();
  });

  it('adopts the orphaned auth account on the real duplicate message', async () => {
    mocks.script.createError = {
      message: 'A user with this email address has already been registered',
    };
    mocks.script.listedUsers = [{ id: 'orphan-uuid', phone: '+639171234567' }];
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ memberId: 'orphan-uuid' });
    // Regression: adoption previously left the /register-created user
    // UNCONFIRMED, locking login with "Email not confirmed".
    const confirmCall = mocks.calls.find((c) => c.op === 'updateUserById')?.arg as {
      id: string;
      attributes: Record<string, unknown>;
    };
    expect(confirmCall.id).toBe('orphan-uuid');
    expect(confirmCall.attributes).toEqual({ phone_confirm: true });
  });

  it('confirms the email identity for adopted email registrations', async () => {
    mocks.script.createError = {
      message: 'A user with this email address has already been registered',
    };
    mocks.script.listedUsers = [{ id: 'orphan-email-uuid', email: 'juan@example.com' }];
    mocks.script.registration = { ...PHONE_REGISTRATION, email: 'juan@example.com' };
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    const confirmCall = mocks.calls.find((c) => c.op === 'updateUserById')?.arg as {
      id: string;
      attributes: Record<string, unknown>;
    };
    expect(confirmCall.id).toBe('orphan-email-uuid');
    expect(confirmCall.attributes).toEqual({ email_confirm: true });
  });

  it('halts approval when identity confirmation fails (no Member write)', async () => {
    mocks.script.confirmError = { message: 'confirm exploded' };
    const { res, seen } = capture();
    await approveRegistration(
      { method: 'POST', query: { id: 'reg-001' }, headers: authed, body: {} } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL', message: 'confirm exploded' } });
    expect(mocks.calls.some((c) => c.table === 'Member' && c.op === 'upsert')).toBe(false);
  });
});

describe('POST /admin/registrations/:id/reject', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://fix.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.registrationReads = 0;
    mocks.script.registration = PHONE_REGISTRATION;
    mocks.script.updatedRegistration = {
      ...PHONE_REGISTRATION,
      status: 'REJECTED',
      rejectionNote: { reason: 'Bad ID', requiredChanges: 'Resubmit ID' },
      reviewedAt: '2026-08-02T00:00:00.000Z',
    };
  });

  it('returns the full rejected registration', async () => {
    const { res, seen } = capture();
    await rejectRegistration(
      {
        method: 'POST',
        query: { id: 'reg-001' },
        headers: authed,
        body: { reason: 'Bad ID', requiredChanges: 'Resubmit ID' },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    // Full registrationSchema shape — the client validates the whole row.
    expect(seen.body).toMatchObject({
      id: 'reg-001',
      status: 'REJECTED',
      firstName: 'Juan',
      phone: '+639171234567',
    });
  });
});

describe('POST /admin/members', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://fix.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.registrationReads = 0;
    mocks.script.updatedRegistration = null;
    mocks.script.existingMembers = [];
    mocks.script.createdAuthId = 'auth-uuid-2';
    mocks.script.createError = null;
    mocks.script.listedUsers = [];
    mocks.script.memberRow = {
      id: 'auth-uuid-2',
      email: 'jane@example.com',
      name: 'Jane Doe',
      status: 'APPROVED_ACTIVE',
      isQualified: false,
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+639180000001',
      address: null,
      countryCode: 'PH',
      countryName: 'Philippines',
      programId: 'prg-domestic',
      referralCode: 'JAD-DOE12',
      accountStatus: 'ACTIVE',
      createdAt: '2026-08-02T00:00:00.000Z',
    };
  });

  it('201s the full validated member (not a partial shape)', async () => {
    const { res, seen } = capture();
    await createMember(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          phone: '+639180000001',
          gender: 'Female',
          countryCode: 'PH',
          countryName: 'Philippines',
          programCode: 'ABROAD',
          dateOfBirth: '1992-01-01',
          temporaryPassword: 'password123',
        },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(201);
    const body = seen.body as Record<string, unknown>;
    // Full adminMemberSchema shape — previously only {id, status}.
    expect(body).toMatchObject({
      id: 'auth-uuid-2',
      firstName: 'Jane',
      email: 'jane@example.com',
      accountStatus: 'ACTIVE',
    });
    expect(typeof body.program).toBe('object');
    // programCode ABROAD maps to the prg-abroad program id.
    const upsert = mocks.calls.find((c) => c.table === 'Member' && c.op === 'upsert')
      ?.arg as Record<string, unknown>;
    expect(upsert.programId).toBe('prg-abroad');
  });

  it('adopts the orphaned auth account on the real duplicate message', async () => {
    mocks.script.createError = {
      message: 'A user with this email address has already been registered',
    };
    mocks.script.listedUsers = [{ id: 'orphan-uuid', email: 'jane@example.com' }];
    mocks.script.memberRow = {
      ...(mocks.script.memberRow as Record<string, unknown>),
      id: 'orphan-uuid',
    };
    const { res, seen } = capture();
    await createMember(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          phone: '+639180000001',
          gender: 'Female',
          countryCode: 'PH',
          countryName: 'Philippines',
          programCode: 'ABROAD',
          dateOfBirth: '1992-01-01',
          temporaryPassword: 'password123',
        },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({ id: 'orphan-uuid', email: 'jane@example.com' });
  });
});
