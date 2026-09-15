import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import handler from './sign.js';

/**
 * POST /cms/upload/sign per-kind allowlist: DOCUMENT/IMAGE/VIDEO/PROMO rules
 * mirror the admin dialog maps; omitted kind keeps legacy IMAGE behavior.
 * Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = async () => {
      if (table === 'Role') return { data: [{ slug: 'super_admin' }], error: null };
      return { data: [], error: null };
    };
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-1' }], error: null });
      } else resolve({ data: [], error: null });
    };
    return b;
  };
  return {
    service: {
      from: (table: string) => builder(table),
      storage: {
        from: () => ({
          createSignedUploadUrl: async () => ({
            data: { signedUrl: 'https://cdn.test/put', token: 'tok', path: 'cms/x.jpg' },
            error: null,
          }),
          getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.test/x.jpg' } }),
        }),
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

const authed = { authorization: 'Bearer good' };
const req = (body?: unknown): VercelRequest =>
  ({ method: 'POST', query: {}, headers: authed, body }) as VercelRequest;

describe('POST /cms/upload/sign', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://sign.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
  });

  it('keeps legacy IMAGE behavior when kind is omitted', async () => {
    const { res, seen } = capture();
    await handler(req({ name: 'a.jpg', type: 'image/jpeg', size: 100 }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ publicUrl: 'https://cdn.test/x.jpg' });
  });

  it.each([
    [{ name: 'b.pdf', type: 'application/pdf', size: 100, kind: 'DOCUMENT' }, 200],
    [{ name: 'c.mp4', type: 'video/mp4', size: 100, kind: 'VIDEO' }, 200],
    [{ name: 'd.mov', type: 'video/quicktime', size: 100, kind: 'PROMO' }, 200],
    [{ name: 'e.png', type: 'image/png', size: 100, kind: 'PROMO' }, 200],
  ])('signs %j', async (body, status) => {
    const { res, seen } = capture();
    await handler(req(body), res);
    expect(seen.status).toBe(status);
  });

  it.each([
    [{ name: 'f.mp4', type: 'video/mp4', size: 100, kind: 'DOCUMENT' }, 'Documents must be'],
    [{ name: 'g.pdf', type: 'application/pdf', size: 100, kind: 'VIDEO' }, 'Videos must be'],
    [{ name: 'h.exe', type: 'application/x-msdownload', size: 100 }, 'Only JPG, PNG and WebP'],
    [{ name: 'i.mp4', type: 'video/mp4', size: 200 * 1024 * 1024, kind: 'VIDEO' }, '100 MB or less'],
    [{ name: 'j.pdf', type: 'application/pdf', size: 30 * 1024 * 1024, kind: 'DOCUMENT' }, '20 MB or less'],
  ])('rejects %j', async (body, messagePart) => {
    const { res, seen } = capture();
    await handler(req(body), res);
    expect(seen.status).toBe(400);
    expect(JSON.stringify(seen.body)).toContain(messagePart);
  });

  it('requires name and type', async () => {
    const missing = capture();
    await handler(req({ name: '', type: 'image/jpeg' }), missing.res);
    expect(missing.seen.status).toBe(400);
    const noType = capture();
    await handler(req({ name: 'a.jpg', type: '' }), noType.res);
    expect(noType.seen.status).toBe(400);
  });
});
