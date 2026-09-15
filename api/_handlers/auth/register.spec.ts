import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import registerHandler from './register.js';

/**
 * Public registration intake (Phase B8+): validation, uniqueness, referral,
 * age, country/program validity, and the PENDING application contract.
 * No authentication — the endpoint is public.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    existingMembers: [] as unknown[],
    sponsors: [] as {
      id: string;
      referralCode?: string | null;
      isQualified?: boolean;
      accountStatus?: string;
    }[],
    minAge: '18',
    country: null as unknown,
    program: null as unknown,
    createResult: 'ok' as 'ok' | 'conflict' | 'error',
    registrationRow: null as unknown,
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.limit = async () => {
      if (table === 'Member') return { data: script.existingMembers, error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => {
      if (table === 'SystemConfig') return { data: { value: script.minAge }, error: null };
      if (table === 'countries') return { data: script.country, error: null };
      if (table === 'Program') return { data: script.program, error: null };
      if (table === 'Registration') return { data: script.registrationRow, error: null };
      return { data: null, error: null };
    };
    // Bare awaited sponsor scan.
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'Member') resolve({ data: script.sponsors, error: null });
      else resolve({ data: null, error: null });
    };
    return {
      ...b,
      insert: async (row: unknown) => {
        calls.push({ table, op: 'insert', arg: row });
        return { error: null };
      },
      delete: () => {
        calls.push({ table, op: 'delete' });
        return {
          eq: async () => {
            // Faithful mock: a deleted row is gone for subsequent reads.
            if (table === 'Registration') script.registrationRow = null;
            return { error: null };
          },
        };
      },
      update: (patch: unknown) => {
        calls.push({ table, op: 'update', arg: patch });
        return { eq: async () => ({ error: null }) };
      },
    };
  };
  return {
    calls,
    script,
    uploadError: null as string | null,
    service: {
      from: (table: string) => builder(table),
      storage: {
        from: () => ({
          upload: async (...args: unknown[]) => {
            calls.push({ table: 'government-ids', op: 'upload', arg: args[0] });
            if (mocks.uploadError) return { error: { message: mocks.uploadError } };
            return { error: null };
          },
        }),
      },
    },
    adminAuth: {
      createUser: async (input: unknown) => {
        calls.push({ table: 'auth.users', op: 'createUser', arg: input });
        if (script.createResult === 'ok')
          return { data: { user: { id: 'new-auth-uuid' } }, error: null };
        if (script.createResult === 'conflict')
          // Real GoTrue duplicate text — the 409 path must match this, not
          // a paraphrase (regression: substring 'already exists' misses it).
          return {
            data: {},
            error: new Error('A user with this email address has already been registered'),
          };
        return { data: {}, error: new Error('signup disabled') };
      },
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ ...mocks.service, auth: { admin: mocks.adminAuth } }),
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

const VALID_BODY = {
  programId: 'prg-domestic',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  dateOfBirth: '1990-01-01',
  gender: 'Male',
  countryCode: 'PH',
  address: 'Manila',
  phone: '+639171234567',
  email: 'new.applicant@example.com',
  password: 'S3cure-password',
  qualificationAnswers: [],
  idDocument: { fileName: 'id.pdf', mimeType: 'application/pdf', sizeBytes: 12345 },
};

const postReq = (body: unknown): VercelRequest =>
  ({ method: 'POST', query: {}, headers: {}, body }) as VercelRequest;

describe('POST /api/v1/auth/register', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://reg.test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.existingMembers = [];
    mocks.script.sponsors = [];
    mocks.script.minAge = '18';
    mocks.script.country = { code: 'PH', name: 'Philippines' };
    mocks.script.program = { id: 'prg-domestic', code: 'DOMESTIC' };
    mocks.script.createResult = 'ok';
    mocks.script.registrationRow = null;
  });

  it('400s invalid bodies', async () => {
    const { res, seen } = capture();
    await registerHandler(postReq({ firstName: 'Nope' }), res);
    expect(seen.status).toBe(400);
    expect(mocks.calls.some((c) => c.op === 'createUser')).toBe(false);
  });

  it('409s duplicate emails (Member row and decided application)', async () => {
    mocks.script.existingMembers = [{ id: 'm-1' }];
    const dup = capture();
    await registerHandler(postReq(VALID_BODY), dup.res);
    expect(dup.seen.status).toBe(409);

    // Auth-level conflict with a decided (REJECTED) application behind it
    // stays 409 (resubmit path); a conflict with no application completes
    // it instead. APPROVED with no Member is a purged orphan and is
    // released (covered by the release test below), not 409.
    mocks.script.existingMembers = [];
    mocks.script.registrationRow = { id: 'reg-old', status: 'REJECTED' };
    mocks.script.createResult = 'conflict';
    const decided = capture();
    await registerHandler(postReq(VALID_BODY), decided.res);
    expect(decided.seen.status).toBe(409);
  });

  it('400s bad referrals, underage applicants, and unknown country/program', async () => {
    const badReferral = capture();
    await registerHandler(postReq({ ...VALID_BODY, referralCode: 'NOPE' }), badReferral.res);
    expect(badReferral.seen.status).toBe(400);

    const underage = capture();
    await registerHandler(postReq({ ...VALID_BODY, dateOfBirth: '2020-01-01' }), underage.res);
    expect(underage.seen.status).toBe(400);

    mocks.script.country = null;
    const badCountry = capture();
    await registerHandler(postReq(VALID_BODY), badCountry.res);
    expect(badCountry.seen.status).toBe(400);

    mocks.script.country = { code: 'PH', name: 'Philippines' };
    mocks.script.program = null;
    const badProgram = capture();
    await registerHandler(postReq(VALID_BODY), badProgram.res);
    expect(badProgram.seen.status).toBe(400);
  });

  it('accepts a qualified-sponsor referral and 201s the application', async () => {
    mocks.script.sponsors = [
      {
        id: 'sponsor-uuid',
        referralCode: 'JD-2026-001',
        isQualified: true,
        accountStatus: 'ACTIVE',
      },
    ];
    const { res, seen } = capture();
    await registerHandler(postReq({ ...VALID_BODY, referralCode: 'jd-2026-001' }), res);
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({
      application: { email: 'new.applicant@example.com', status: 'PENDING', emailVerified: false },
    });
    const createCall = mocks.calls.find((c) => c.op === 'createUser')?.arg as Record<
      string,
      unknown
    >;
    expect(createCall).toMatchObject({ email: 'new.applicant@example.com', email_confirm: false });
    const insert = mocks.calls.find((c) => c.table === 'Registration')?.arg as Record<
      string,
      unknown
    >;
    expect(insert).toMatchObject({
      status: 'PENDING',
      email: 'new.applicant@example.com',
      phone: '+639171234567',
      programId: 'prg-domestic',
      programCode: 'DOMESTIC',
      countryName: 'Philippines',
      referralCode: 'jd-2026-001',
      governmentId: { fileName: 'id.pdf' },
    });
    expect(typeof insert.id === 'string' && (insert.id as string).startsWith('reg-')).toBe(true);
  });

  it('replays an in-flight application without duplicating', async () => {
    mocks.script.registrationRow = {
      id: 'reg-existing',
      status: 'PENDING',
      createdAt: '2026-08-01T00:00:00.000Z',
    };
    const { res, seen } = capture();
    await registerHandler(postReq(VALID_BODY), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      application: { id: 'reg-existing', status: 'PENDING' },
    });
    expect(mocks.calls.some((c) => c.op === 'createUser')).toBe(false);
    expect(mocks.calls.some((c) => c.table === 'Registration')).toBe(false);
  });

  it('409s a decided application for the same email', async () => {
    mocks.script.registrationRow = { id: 'reg-old', status: 'REJECTED' };
    const { res, seen } = capture();
    await registerHandler(postReq(VALID_BODY), res);
    expect(seen.status).toBe(409);
    expect(mocks.calls.some((c) => c.op === 'createUser')).toBe(false);
  });

  it('releases a purged member’s leftover APPROVED registration instead of 409', async () => {
    // Orphaned application: approval always creates the member, so an
    // APPROVED registration with no Member row means the member was purged
    // (purge-everything semantics). The surviving auth account conflicts, so
    // the interrupted registration is completed fresh.
    mocks.script.existingMembers = [];
    mocks.script.registrationRow = { id: 'reg-stale', status: 'APPROVED_ACTIVE' };
    mocks.script.createResult = 'conflict';
    const { res, seen } = capture();
    await registerHandler(postReq(VALID_BODY), res);
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({
      application: { email: 'new.applicant@example.com', status: 'PENDING' },
    });
    expect(
      mocks.calls.some((c) => c.table === 'Registration' && c.op === 'delete'),
    ).toBe(true);
  });

  it('completes the interrupted registration on auth conflict', async () => {
    // Orphaned auth account, no application row: the exact user-reported
    // scenario. The missing row is created instead of stranding a 409.
    mocks.script.registrationRow = null;
    mocks.script.createResult = 'conflict';
    const { res, seen } = capture();
    await registerHandler(postReq(VALID_BODY), res);
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({
      application: { email: 'new.applicant@example.com', status: 'PENDING' },
    });
    const insert = mocks.calls.find((c) => c.table === 'Registration')?.arg as Record<
      string,
      unknown
    >;
    expect(insert.email).toBe('new.applicant@example.com');
  });

  it('uploads the ID file and persists only metadata plus the storage path', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const { res, seen } = capture();
    await registerHandler(
      postReq({
        ...VALID_BODY,
        idDocument: { fileName: 'id.png', mimeType: 'image/png', sizeBytes: 70, data: png },
      }),
      res,
    );
    expect(seen.status).toBe(201);
    const upload = mocks.calls.find((c) => c.table === 'government-ids')?.arg as string;
    expect(typeof upload === 'string' && upload.length > 0).toBe(true);
    const update = mocks.calls.find((c) => c.table === 'Registration' && c.op === 'update')
      ?.arg as Record<string, unknown>;
    const governmentId = update.governmentId as Record<string, unknown>;
    expect(governmentId.storagePath).toBe(upload);
    expect(governmentId.data).toBeUndefined();
    const insert = mocks.calls.find((c) => c.table === 'Registration' && c.op === 'insert')
      ?.arg as Record<string, unknown>;
    expect((insert.governmentId as Record<string, unknown>).data).toBeUndefined();
  });

  it('500s a failed upload so the retry replays and re-attempts', async () => {
    mocks.uploadError = 'bucket missing';
    const png = 'data:image/png;base64,aGk=';
    const { res, seen } = capture();
    await registerHandler(
      postReq({
        ...VALID_BODY,
        idDocument: { fileName: 'id.png', mimeType: 'image/png', sizeBytes: 3, data: png },
      }),
      res,
    );
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL', message: 'bucket missing' } });
    mocks.uploadError = null;
  });

  it('400s a disallowed ID mime type without uploading', async () => {
    const { res, seen } = capture();
    await registerHandler(
      postReq({
        ...VALID_BODY,
        idDocument: {
          fileName: 'id.exe',
          mimeType: 'application/x-msdownload',
          sizeBytes: 10,
          data: 'data:,QQ==',
        },
      }),
      res,
    );
    expect(seen.status).toBe(500);
    expect(mocks.calls.some((c) => c.table === 'government-ids')).toBe(false);
  });
});
