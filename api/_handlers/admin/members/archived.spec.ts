import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import archived from './archived.js';

/**
 * GET /admin/members/archived: archived members must survive the
 * archivedMemberSchema contract. Member name/phone/referralCode columns are
 * nullable, so the mapping normalizes them (via mapMemberRow + explicit
 * fallbacks) instead of silently dropping the archived row. Supabase is
 * fully mocked.
 */
const mocks = vi.hoisted(() => {
  const script = {
    roleSlug: 'super_admin',
    members: [] as Record<string, unknown>[],
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.not = () => chain;
    chain.order = async () => {
      if (table === 'Member') return { data: script.members, error: null };
      return { data: [], error: null };
    };
    chain.in = async () => ({ data: [{ slug: script.roleSlug }], error: null });
    chain.maybeSingle = async () => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        return { data: [{ roleId: 'r-1' }], error: null };
      }
      return { data: null, error: null };
    };
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-1' }], error: null });
      } else resolve({ data: null, error: null });
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

const authed = { authorization: 'Bearer good' };
const getReq = (): VercelRequest =>
  ({ method: 'GET', query: {}, headers: authed }) as VercelRequest;

// Sparse but realistic archived row: nullable name/phone columns are null,
// no age/program columns exist on Member - the mapping must still validate.
const SPARSE_ARCHIVED = {
  id: 'mem-009',
  email: 'sparse@example.com',
  status: 'APPROVED_ACTIVE',
  isQualified: true,
  firstName: null,
  lastName: null,
  dateOfBirth: null,
  gender: null,
  phone: null,
  address: null,
  countryCode: null,
  countryName: null,
  programId: null,
  referralCode: null,
  accountStatus: 'ACTIVE',
  createdAt: '2026-08-10T00:00:00.000Z',
  archivedAt: '2026-09-01T00:00:00.000Z',
  archivedBy: 'staff-uuid-1',
  archiveSnapshot: null,
};

describe('GET /admin/members/archived mapping', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://members.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.roleSlug = 'super_admin';
    mocks.script.members = [{ ...SPARSE_ARCHIVED }];
  });

  it('keeps sparse archived members instead of dropping them', async () => {
    const { res, seen } = capture();
    await archived(getReq(), res);
    expect(seen.status).toBe(200);
    const data = (seen.body as { data: Record<string, unknown>[] }).data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      id: 'arch-mem-009',
      memberId: 'mem-009',
      archivedBy: 'staff-uuid-1',
      previousStatus: 'APPROVED_ACTIVE',
      previousAccountStatus: 'ACTIVE',
    });
    const original = data[0]?.originalData as Record<string, unknown>;
    expect(typeof original.age).toBe('number');
    expect(original.program).toMatchObject({ id: 'prg-domestic' });
    expect(original.firstName).toBe('?');
    expect(original.phone).toBe('?');
  });

  it('prefers the archive snapshot over the live row', async () => {
    mocks.script.members = [
      {
        ...SPARSE_ARCHIVED,
        archiveSnapshot: {
          firstName: 'Snap',
          lastName: 'Shot',
          phone: '+63 900 000 0000',
          referralCode: 'JAD-SNAP',
        },
      },
    ];
    const { res, seen } = capture();
    await archived(getReq(), res);
    const data = (seen.body as { data: Record<string, unknown>[] }).data;
    expect(data).toHaveLength(1);
    expect(data[0]?.originalData).toMatchObject({
      firstName: 'Snap',
      lastName: 'Shot',
      phone: '+63 900 000 0000',
    });
  });

  it('drops rows that cannot satisfy the contract', async () => {
    mocks.script.members = [
      { ...SPARSE_ARCHIVED },
      { ...SPARSE_ARCHIVED, id: 'mem-bad', status: 'BOGUS' },
    ];
    const { res, seen } = capture();
    await archived(getReq(), res);
    const data = (seen.body as { data: Record<string, unknown>[] }).data;
    expect(data.map((r) => r.memberId)).toEqual(['mem-009']);
  });
});
