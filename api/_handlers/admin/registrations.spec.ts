import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './registrations.js';

/**
 * GET /admin/registrations - the queue must never silently lose rows.
 * PostgREST serializes nullable columns as JSON `null`; rows with NULL
 * optional fields (address, referralCode, reviewed*) must still validate and
 * be returned. Genuinely invalid rows are dropped but logged with their id
 * and counted in `meta.invalid` so the queue page can banner the gap between
 * the dashboard count and the visible list.
 */
const mocks = vi.hoisted(() => {
  const script = {
    rows: [] as Record<string, unknown>[],
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = async () => ({ data: script.rows, error: null });
    b.in = async (key: string) => {
      if (table === 'Role' && key === 'id') return { data: [{ slug: 'admin' }], error: null };
      return { data: [], error: null };
    };
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'StaffUser') {
        resolve({ data: [{ status: 'ACTIVE', mustChangePassword: false }], error: null });
      } else if (table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-admin' }], error: null });
      } else if (table === 'Role') {
        resolve({
          data: [
            {
              id: 'r-admin',
              key: 'admin',
              slug: 'admin',
              name: 'Admin',
              permissions: ['dashboard', 'registrations', 'members'],
              is_system: true,
            },
          ],
          error: null,
        });
      } else {
        resolve({ data: [], error: null });
      }
    };
    return b;
  };
  return {
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

function pendingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'reg-mu0x26hx',
    status: 'PENDING',
    firstName: 'Juan',
    middleInitial: 'D',
    lastName: 'Dela Cruz',
    nameSuffix: 'Jr.',
    email: 'juan@example.com',
    phone: '+639170000001',
    dateOfBirth: '1992-03-14',
    gender: 'Male',
    countryCode: 'PH',
    countryName: 'Philippines',
    address: null,
    programId: 'prg-domestic',
    programCode: 'DOMESTIC',
    referralCode: null,
    qualificationAnswers: [{ questionId: 'q-001', answer: 'Yes' }],
    governmentId: { fileName: 'juan_id.pdf', mimeType: 'application/pdf', sizeBytes: 245760 },
    submittedAt: '2026-09-14T08:00:00.000Z',
    createdAt: '2026-09-14T08:00:00.000Z',
    updatedAt: '2026-09-14T08:00:00.000Z',
    reviewedAt: null,
    reviewedBy: null,
    rejectionNote: null,
    ...overrides,
  };
}

describe('GET /admin/registrations', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://reg.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    vi.restoreAllMocks();
    mocks.script.rows = [];
  });

  it('returns PENDING rows whose optional fields are JSON null', async () => {
    mocks.script.rows = [pendingRow()];
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(200);
    const body = seen.body as { data: { id: string }[]; meta: { invalid: number } };
    expect(body.data.map((r) => r.id)).toContain('reg-mu0x26hx');
    expect(body.meta.invalid).toBe(0);
  });

  it('drops rows missing required fields, logs their ids, and reports meta.invalid', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.script.rows = [pendingRow({ id: 'reg-bad-1', phone: null })];
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(200);
    const body = seen.body as { data: unknown[]; meta: { invalid: number } };
    expect(body.data).toEqual([]);
    expect(body.meta.invalid).toBe(1);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[1] ?? warn.mock.calls[0]?.[0])).toContain('reg-bad-1');
  });

  it('keeps rows whose governmentId payload is malformed (degrades to no file)', async () => {
    mocks.script.rows = [pendingRow({ id: 'reg-nofile-1', governmentId: {} })];
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(200);
    const body = seen.body as { data: { id: string }[]; meta: { invalid: number } };
    expect(body.data.map((r) => r.id)).toContain('reg-nofile-1');
    expect(body.meta.invalid).toBe(0);
  });

  it('keeps rows with null required-but-nullable-in-DB fields mapped explicitly', async () => {
    // phone/countryCode are NULLABLE in the Registration table but required
    // by the contract: null maps to undefined so the drop (when it happens)
    // is logged with a missing-field path, never a null-type surprise.
    // A null phone is still unreviewable without contact details.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.script.rows = [pendingRow({ id: 'reg-nullable-1', phone: null, countryCode: null })];
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(200);
    const body = seen.body as { data: unknown[]; meta: { invalid: number } };
    expect(body.data).toEqual([]);
    expect(body.meta.invalid).toBe(1);
    const allWarnText = warn.mock.calls.map((c) => String(c[1] ?? c[0])).join(' ');
    expect(allWarnText).toContain('reg-nullable-1');
  });
});
