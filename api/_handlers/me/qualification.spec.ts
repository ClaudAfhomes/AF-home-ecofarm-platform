import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import qualificationHandler from './qualification.js';

/** /me/qualification identity + state gates (Phase B8+ production accuracy). */
const mocks = vi.hoisted(() => {
  const script = {
    member: null as unknown,
    minAge: '18',
    registration: null as unknown,
    authUser: null as unknown,
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.maybeSingle = async () => {
      if (table === 'Member') return { data: script.member, error: null };
      if (table === 'SystemConfig') return { data: { value: script.minAge }, error: null };
      if (table === 'Registration') return { data: script.registration, error: null };
      return { data: null, error: null };
    };
    b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return { ...b };
  };
  return {
    script,
    service: {
      from: (table: string) => builder(table),
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: script.authUser }, error: null }),
        },
      },
    },
    anon: {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'mem-uuid-1', user_metadata: {} } },
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

const authedGet = {
  method: 'GET',
  query: {},
  headers: { authorization: 'Bearer good' },
} as VercelRequest;

const MEMBER = {
  id: 'mem-uuid-1',
  status: 'APPROVED_ACTIVE',
  isQualified: true,
  dateOfBirth: '1990-01-01',
  registrationId: 'reg-001',
};

function reg(governmentId: unknown) {
  return { id: 'reg-001', status: 'APPROVED_ACTIVE', governmentId, rejectionNote: null };
}

function emailUser(confirmed: boolean) {
  return {
    id: 'mem-uuid-1',
    email: 'juan@example.com',
    email_confirmed_at: confirmed ? '2026-08-02T00:00:00Z' : null,
    phone: null,
    phone_confirmed_at: null,
  };
}

describe('GET /me/qualification', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://q.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.member = MEMBER;
    mocks.script.minAge = '18';
    mocks.script.registration = reg({
      fileName: 'id.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
    });
  });

  it('marks a phone-identity account verified when its phone is confirmed', async () => {
    mocks.script.authUser = {
      id: 'mem-uuid-1',
      email: null,
      email_confirmed_at: null,
      phone: '+639170000001',
      phone_confirmed_at: '2026-08-02T00:00:00Z',
    };
    const { res, seen } = capture();
    await qualificationHandler(authedGet, res);
    expect(seen.status).toBe(200);
    const body = seen.body as {
      isQualified: boolean;
      requirements: { key: string; met: boolean }[];
    };
    expect(body.isQualified).toBe(true);
    expect(body.requirements.find((r) => r.key === 'EMAIL_VERIFIED')?.met).toBe(true);
    expect(body.requirements.find((r) => r.key === 'QUALIFICATION')?.met).toBe(true);
  });

  it('keeps an unconfirmed email account unverified', async () => {
    mocks.script.authUser = emailUser(false);
    const { res, seen } = capture();
    await qualificationHandler(authedGet, res);
    const body = seen.body as { requirements: { key: string; met: boolean }[] };
    expect(body.requirements.find((r) => r.key === 'EMAIL_VERIFIED')?.met).toBe(false);
  });

  it('treats an email identity as verified once confirmed', async () => {
    mocks.script.authUser = emailUser(true);
    const { res, seen } = capture();
    await qualificationHandler(authedGet, res);
    const body = seen.body as { requirements: { key: string; met: boolean }[] };
    expect(body.requirements.find((r) => r.key === 'EMAIL_VERIFIED')?.met).toBe(true);
  });
});
