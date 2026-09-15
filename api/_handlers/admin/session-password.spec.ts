import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import passwordHandler from './session/password.js';

/**
 * POST /admin/session/password — change own staff password. Red: the handler
 * file does not exist yet.
 */
const mocks = vi.hoisted(() => {
  const staffRows: Record<string, unknown>[] = [];
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    signInError: null as { message: string } | null,
    updateError: null as { message: string } | null,
  };
  return { staffRows, calls, script };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => {
    if (key === 'service') {
      return {
        from: (table: string) => {
          const b: Record<string, (...a: never[]) => unknown> = {};
          b.select = () => b;
          b.eq = () => {
            const rows = table === 'StaffUser' ? [...mocks.staffRows] : [];
            const result = { data: rows, error: null };
            return {
              then: (resolve: (v: unknown) => void) => resolve(result),
              maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
            };
          };
          b.update = (patch: unknown) => {
            mocks.calls.push({ table, op: 'update', arg: patch });
            return {
              eq: async () => {
                const row = mocks.staffRows[0] as Record<string, unknown> | undefined;
                if (row && typeof patch === 'object' && patch) Object.assign(row, patch);
                return { data: null, error: null };
              },
            };
          };
          b.insert = async (row: unknown) => {
            mocks.calls.push({ table, op: 'insert', arg: row });
            return { error: null };
          };
          return b;
        },
        auth: {
          admin: {
            updateUserById: async (id: unknown, attrs: unknown) => {
              mocks.calls.push({ table: 'auth.users', op: 'updateUserById', arg: { id, attrs } });
              if (mocks.script.updateError) return { data: {}, error: mocks.script.updateError };
              return { data: { user: { id } }, error: null };
            },
          },
        },
      };
    }
    return {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'staff-1', user_metadata: {} } },
          error: null,
        }),
        signInWithPassword: async (creds: unknown) => {
          mocks.calls.push({ table: 'auth', op: 'signInWithPassword', arg: creds });
          if (mocks.script.signInError) return { data: {}, error: mocks.script.signInError };
          return { data: { user: { id: 'staff-1' } }, error: null };
        },
      },
    };
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
const GOOD_BODY = { currentPassword: 'old-pass-1', newPassword: 'NewPass12' };

describe('POST /admin/session/password', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://fix.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.staffRows.length = 0;
    mocks.calls.length = 0;
    mocks.script.signInError = null;
    mocks.script.updateError = null;
    mocks.staffRows.push({
      id: 'staff-1',
      email: 'ada.admin@jad.example',
      name: 'Ada Admin',
      status: 'ACTIVE',
      mustChangePassword: true,
    });
  });

  it('verifies the current password, updates it, clears the flag, and audits', async () => {
    const { res, seen } = capture();
    await passwordHandler(
      { method: 'POST', query: {}, headers: authed, body: GOOD_BODY } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ changed: true });
    const signIn = mocks.calls.find((c) => c.op === 'signInWithPassword');
    expect(signIn?.arg).toMatchObject({
      email: 'ada.admin@jad.example',
      password: 'old-pass-1',
    });
    const updated = mocks.calls.find((c) => c.op === 'updateUserById');
    expect(updated?.arg).toMatchObject({
      id: 'staff-1',
      attrs: { password: 'NewPass12' },
    });
    const cleared = mocks.calls.find((c) => c.table === 'StaffUser' && c.op === 'update');
    expect(cleared?.arg).toMatchObject({ mustChangePassword: false });
    const audit = mocks.calls.find((c) => c.table === 'AuditLog' && c.op === 'insert');
    expect(audit?.arg).toMatchObject({ action: 'STAFF_PASSWORD_CHANGED', target_id: 'staff-1' });
  });

  it('rejects a wrong current password without touching the account', async () => {
    mocks.script.signInError = { message: 'Invalid login credentials' };
    const { res, seen } = capture();
    await passwordHandler(
      { method: 'POST', query: {}, headers: authed, body: GOOD_BODY } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(401);
    expect(mocks.calls.some((c) => c.op === 'updateUserById')).toBe(false);
    expect(mocks.staffRows[0]!['mustChangePassword']).toBe(true);
  });

  it('rejects a weak new password', async () => {
    const { res, seen } = capture();
    await passwordHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: { currentPassword: 'old-pass-1', newPassword: 'short' },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(400);
    expect(mocks.calls.some((c) => c.op === 'updateUserById')).toBe(false);
  });
});
