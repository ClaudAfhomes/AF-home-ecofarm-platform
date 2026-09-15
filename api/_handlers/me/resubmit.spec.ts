import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import resubmitHandler from './resubmit.js';

/**
 * Resubmit ID upload (Phase B8+): fresh file bytes upload to the private
 * bucket while only metadata (+ storagePath) is stored; payloads without
 * bytes keep the existing document untouched.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    member: null as unknown,
    minAge: '18',
    uploadError: null as string | null,
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.maybeSingle = async () => {
      if (table === 'Member') return { data: script.member, error: null };
      if (table === 'SystemConfig') return { data: { value: script.minAge }, error: null };
      return { data: null, error: null };
    };
    return {
      ...b,
      update: (patch: unknown) => {
        calls.push({ table, op: 'update', arg: patch });
        return { eq: async () => ({ error: null }) };
      },
    };
  };
  return {
    calls,
    script,
    service: {
      from: (table: string) => builder(table),
      storage: {
        from: () => ({
          upload: async (...args: unknown[]) => {
            calls.push({ table: 'government-ids', op: 'upload', arg: args[0] });
            if (script.uploadError) return { error: { message: script.uploadError } };
            return { error: null };
          },
        }),
      },
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: null } }),
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

const authed = { authorization: 'Bearer good' };

describe('POST /me/resubmit government ID', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://doc.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.uploadError = null;
    mocks.script.member = {
      id: 'mem-uuid-1',
      status: 'REJECTED',
      email: 'juan@example.com',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      countryCode: 'PH',
      registrationId: 'reg-001',
    };
  });

  it('uploads a fresh file and stores metadata plus the path', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const { res, seen } = capture();
    await resubmitHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: {
          governmentId: { fileName: 'id.png', mimeType: 'image/png', sizeBytes: 70, data: png },
        },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    expect(mocks.calls.some((c) => c.table === 'government-ids')).toBe(true);
    const update = mocks.calls.find((c) => c.table === 'Registration')?.arg as Record<
      string,
      unknown
    >;
    const governmentId = update.governmentId as Record<string, unknown>;
    expect(typeof governmentId.storagePath === 'string').toBe(true);
    expect(governmentId.data).toBeUndefined();
    expect(governmentId.fileName).toBe('id.png');
  });

  it('leaves the stored document alone when no bytes are sent', async () => {
    const { res, seen } = capture();
    await resubmitHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: { phone: '+639100000001' },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    expect(mocks.calls.some((c) => c.table === 'government-ids')).toBe(false);
  });

  it('500s a failed upload without losing the application update', async () => {
    mocks.script.uploadError = 'bucket missing';
    const { res, seen } = capture();
    await resubmitHandler(
      {
        method: 'POST',
        query: {},
        headers: authed,
        body: {
          governmentId: {
            fileName: 'id.png',
            mimeType: 'image/png',
            sizeBytes: 3,
            data: 'data:,QQ==',
          },
        },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(500);
    expect(seen.body).toMatchObject({ error: { code: 'INTERNAL', message: 'bucket missing' } });
  });
});
