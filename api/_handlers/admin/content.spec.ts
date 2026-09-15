import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler, { buildContentShare } from './content.js';

/**
 * POST /admin/content (marketing tools persistence): role gates, validation,
 * and ContentItem insert mapping. Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    inserted: null as Record<string, unknown> | null,
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = async () => ({ data: [], error: null });
    b.in = async () => {
      if (table === 'Role') return { data: [{ slug: script.roleSlug }], error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => ({ data: null, error: null });
    b.single = async () => ({ data: script.inserted, error: null });
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-1' }], error: null });
      } else resolve({ data: [], error: null });
    };
    return {
      ...b,
      insert: (row: unknown) => {
        calls.push({ table, op: 'insert', arg: row });
        script.inserted = {
          ...(row as Record<string, unknown>),
          created_at: '2026-09-01T00:00:00.000Z',
        };
        return { select: () => ({ single: b.single }) };
      },
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
const req = (method: string, body?: unknown): VercelRequest =>
  ({ method, query: {}, headers: authed, body }) as VercelRequest;

describe('POST /admin/content', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://content.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'super_admin';
    mocks.script.inserted = null;
  });

  it('builds server-provided share targets from the download URL', () => {
    const share = buildContentShare('Showcase', 'https://cdn.test/showcase.jpg');
    expect(share.copyUrl).toBe('https://cdn.test/showcase.jpg');
    expect(share.messengerUrl).toContain(encodeURIComponent('https://cdn.test/showcase.jpg'));
    expect(share.viberUrl).toContain(encodeURIComponent('Showcase'));
  });

  it('403s non-staff roles and 400s invalid bodies', async () => {
    mocks.script.roleSlug = 'finance';
    const forbidden = capture();
    await handler(
      req('POST', { title: 'T', kind: 'IMAGE', downloadUrl: 'https://cdn.test/t.jpg' }),
      forbidden.res,
    );
    expect(forbidden.seen.status).toBe(403);

    mocks.script.roleSlug = 'super_admin';
    const invalid = capture();
    await handler(req('POST', { title: '', kind: 'IMAGE' }), invalid.res);
    expect(invalid.seen.status).toBe(400);
  });

  it('201s persisted content with generated share links and published=true', async () => {
    const { res, seen } = capture();
    await handler(
      req('POST', {
        title: 'Showcase',
        description: 'Social posts',
        kind: 'IMAGE',
        downloadUrl: 'https://cdn.test/showcase.jpg',
      }),
      res,
    );
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({
      title: 'Showcase',
      kind: 'IMAGE',
      downloadUrl: 'https://cdn.test/showcase.jpg',
      share: {
        copyUrl: 'https://cdn.test/showcase.jpg',
      },
    });
    const insert = mocks.calls.find((c) => c.table === 'ContentItem')?.arg as Record<
      string,
      unknown
    >;
    expect(insert.title).toBe('Showcase');
    expect(insert.download_url).toBe('https://cdn.test/showcase.jpg');
    expect(insert.published).toBe(true);
    expect(String(insert.id)).toMatch(/^cnt-/);
  });
});
