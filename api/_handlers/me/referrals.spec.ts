import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import listDirectReferrals from './direct-referrals.js';
import getGroupNetwork from './reports/group-network.js';
import getGenealogy from './genealogy.js';

/** Member referral endpoints (Phase B7): graph math over sponsor links. */
const mocks = vi.hoisted(() => {
  const rows = [
    {
      id: 'mem-uuid-1',
      name: 'Juan Dela Cruz',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      status: 'APPROVED_ACTIVE',
      isQualified: true,
      sponsorId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'mem-uuid-2',
      name: 'Maria Santos',
      firstName: 'Maria',
      lastName: 'Santos',
      status: 'APPROVED_ACTIVE',
      isQualified: true,
      sponsorId: 'mem-uuid-1',
      createdAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 'mem-uuid-3',
      name: 'Ana Anay',
      firstName: 'Ana',
      lastName: 'Anay',
      status: 'PENDING',
      isQualified: false,
      sponsorId: 'mem-uuid-1',
      createdAt: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'mem-uuid-4',
      name: 'Kevin Kintanar',
      firstName: 'Kevin',
      lastName: 'Kintanar',
      status: 'REJECTED',
      isQualified: false,
      sponsorId: 'mem-uuid-2',
      createdAt: '2026-04-01T00:00:00.000Z',
    },
  ];
  return {
    service: {
      from: () => ({
        select: async () => ({ data: rows, error: null }),
      }),
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

describe('member referral endpoints', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://b7.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
  });

  it('lists direct referrals in id order', async () => {
    const { res, seen } = capture();
    await listDirectReferrals(authedGet, res);
    expect(seen.status).toBe(200);
    const body = seen.body as { data: { id: string; name: string }[] };
    expect(body.data.map((r) => r.id)).toEqual(['mem-uuid-2', 'mem-uuid-3']);
    expect(body.data[0]).toMatchObject({ name: 'Maria Santos', isQualified: true });
  });

  it('summarizes the whole downline', async () => {
    const { res, seen } = capture();
    await getGroupNetwork(authedGet, res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({
      totalMembers: 3,
      directReferrals: 2,
      qualified: 1,
      pending: 1,
      rejected: 1,
    });
  });

  it('builds the nested genealogy tree', async () => {
    const { res, seen } = capture();
    await getGenealogy(authedGet, res);
    expect(seen.status).toBe(200);
    const body = seen.body as {
      root: { id: string; children: { id: string; children: { id: string }[] }[] };
    };
    expect(body.root.id).toBe('mem-uuid-1');
    expect(body.root.children.map((c) => c.id)).toEqual(['mem-uuid-2', 'mem-uuid-3']);
    expect(body.root.children[0]?.children.map((c) => c.id)).toEqual(['mem-uuid-4']);
  });
});
