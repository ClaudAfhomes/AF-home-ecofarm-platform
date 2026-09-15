import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import handler, { marketingToolsObjectKey } from './[id].js';

/**
 * DELETE /admin/content/:id (marketing tool removal): role gates, row +
 * bucket-object deletion, audit. Supabase (PostgREST + Storage) is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const script = {
    roleSlug: 'super_admin',
    item: null as Record<string, unknown> | null,
    storageError: null as { message: string } | null,
  };
  const builder = (table: string) => {
    const b: Record<string, (...a: never[]) => unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = async () => {
      if (table === 'Role') return { data: [{ slug: script.roleSlug }], error: null };
      return { data: [], error: null };
    };
    b.maybeSingle = async () => {
      if (table === 'ContentItem') return { data: script.item, error: null };
      return { data: null, error: null };
    };
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'MemberRole' || table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-1' }], error: null });
      } else resolve({ data: null, error: null });
    };
    return {
      ...b,
      insert: async (row: unknown) => {
        calls.push({ table, op: 'insert', arg: row });
        return { error: null };
      },
      update: (patch: unknown) => {
        calls.push({ table, op: 'update', arg: patch });
        const merged = { ...(script.item ?? {}), ...((patch ?? {}) as Record<string, unknown>) };
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: merged, error: null }),
            }),
          }),
        };
      },
      delete: () => ({
        eq: async (column: string, value: unknown) => {
          calls.push({ table, op: 'delete', arg: { [column]: value } });
          return { error: null };
        },
      }),
    };
  };
  return {
    calls,
    script,
    service: {
      from: (table: string) => builder(table),
      storage: {
        from: (bucket: string) => ({
          remove: async (paths: string[]) => {
            calls.push({ table: `storage:${bucket}`, op: 'remove', arg: paths });
            return {
              data: script.storageError ? null : paths.map((p) => ({ name: p })),
              error: script.storageError,
            };
          },
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
const deleteReq = (id: string): VercelRequest =>
  ({ method: 'DELETE', query: { id }, headers: authed }) as VercelRequest;
const patchReq = (id: string, body: unknown): VercelRequest =>
  ({ method: 'PATCH', query: { id }, headers: authed, body }) as VercelRequest;

const BUCKET_ITEM = {
  id: 'cnt-001',
  title: 'Showcase Flyer',
  kind: 'DOCUMENT',
  download_url:
    'https://ref.supabase.co/storage/v1/object/public/marketing-tools/cms/1756000000-ab12cd-showcase.pdf',
  created_at: '2026-09-01T00:00:00.000Z',
};

describe('marketingToolsObjectKey', () => {
  it('extracts the bucket key from public marketing-tools URLs', () => {
    expect(marketingToolsObjectKey(BUCKET_ITEM.download_url)).toBe(
      'cms/1756000000-ab12cd-showcase.pdf',
    );
  });

  it('strips query strings', () => {
    expect(marketingToolsObjectKey(`${BUCKET_ITEM.download_url}?t=123`)).toBe(
      'cms/1756000000-ab12cd-showcase.pdf',
    );
  });

  it('returns null for external URLs and non-strings', () => {
    expect(marketingToolsObjectKey('https://example.com/files/flyer.pdf')).toBeNull();
    expect(
      marketingToolsObjectKey(
        'https://ref.supabase.co/storage/v1/object/public/other-bucket/a.pdf',
      ),
    ).toBeNull();
    expect(marketingToolsObjectKey(null)).toBeNull();
    expect(marketingToolsObjectKey(undefined)).toBeNull();
  });

  it('rejects path traversal', () => {
    expect(
      marketingToolsObjectKey(
        'https://ref.supabase.co/storage/v1/object/public/marketing-tools/../secret.txt',
      ),
    ).toBeNull();
  });
});

describe('DELETE /admin/content/:id', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://content.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'super_admin';
    mocks.script.item = { ...BUCKET_ITEM };
    mocks.script.storageError = null;
  });

  it('403s non-staff roles before any mutation', async () => {
    mocks.script.roleSlug = 'merchant';
    const { res, seen } = capture();
    await handler(deleteReq('cnt-001'), res);
    expect(seen.status).toBe(403);
    expect(mocks.calls.some((c) => c.op === 'delete' || c.op === 'remove')).toBe(false);
  });

  it('404s when the tool does not exist', async () => {
    mocks.script.item = null;
    const { res, seen } = capture();
    await handler(deleteReq('cnt-missing'), res);
    expect(seen.status).toBe(404);
    expect(mocks.calls.some((c) => c.op === 'delete' || c.op === 'remove')).toBe(false);
  });

  it('deletes the row, removes the bucket object, and audits', async () => {
    const { res, seen } = capture();
    await handler(deleteReq('cnt-001'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ id: 'cnt-001', deleted: true, fileRemoved: true });
    const removal = mocks.calls.find((c) => c.table === 'storage:marketing-tools');
    expect(removal?.op).toBe('remove');
    expect(removal?.arg).toEqual(['cms/1756000000-ab12cd-showcase.pdf']);
    expect(mocks.calls.some((c) => c.table === 'ContentItem' && c.op === 'delete')).toBe(true);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(audit).toMatchObject({
      action: 'CONTENT_DELETED',
      actor_id: 'staff-uuid-1',
      target_type: 'ContentItem',
      target_id: 'cnt-001',
      target_name: 'Showcase Flyer',
    });
    expect(String(audit.detail)).toContain('uploaded file removed');
  });

  it('skips storage removal for external URLs', async () => {
    mocks.script.item = { ...BUCKET_ITEM, download_url: 'https://example.com/files/flyer.pdf' };
    const { res, seen } = capture();
    await handler(deleteReq('cnt-001'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ id: 'cnt-001', deleted: true, fileRemoved: false });
    expect(mocks.calls.some((c) => c.table === 'storage:marketing-tools')).toBe(false);
    expect(mocks.calls.some((c) => c.table === 'ContentItem' && c.op === 'delete')).toBe(true);
  });

  it('still deletes the row when storage removal fails', async () => {
    mocks.script.storageError = { message: 'bucket unavailable' };
    const { res, seen } = capture();
    await handler(deleteReq('cnt-001'), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({ id: 'cnt-001', deleted: true, fileRemoved: false });
    expect(mocks.calls.some((c) => c.table === 'ContentItem' && c.op === 'delete')).toBe(true);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(String(audit.detail)).toContain('uploaded file removal failed');
  });
});

describe('PATCH /admin/content/:id', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://content.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.roleSlug = 'super_admin';
    mocks.script.item = { ...BUCKET_ITEM };
    mocks.script.storageError = null;
  });

  it('403s non-staff roles before any mutation', async () => {
    mocks.script.roleSlug = 'finance';
    const { res, seen } = capture();
    await handler(patchReq('cnt-001', { title: 'New Title' }), res);
    expect(seen.status).toBe(403);
    expect(mocks.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('404s when the tool does not exist', async () => {
    mocks.script.item = null;
    const { res, seen } = capture();
    await handler(patchReq('cnt-missing', { title: 'New Title' }), res);
    expect(seen.status).toBe(404);
    expect(mocks.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('400s invalid and empty patches', async () => {
    const { res: res1, seen: seen1 } = capture();
    await handler(patchReq('cnt-001', { kind: 'NOPE' }), res1);
    expect(seen1.status).toBe(400);

    const { res: res2, seen: seen2 } = capture();
    await handler(patchReq('cnt-001', {}), res2);
    expect(seen2.status).toBe(400);
    expect(seen2.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(mocks.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('updates metadata fields and audits', async () => {
    const { res, seen } = capture();
    await handler(patchReq('cnt-001', { title: 'New Title', kind: 'IMAGE' }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'cnt-001', title: 'New Title', kind: 'IMAGE' });
    const update = mocks.calls.find((c) => c.table === 'ContentItem' && c.op === 'update');
    expect(update?.arg).toMatchObject({ title: 'New Title', kind: 'IMAGE' });
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(audit).toMatchObject({
      action: 'CONTENT_UPDATED',
      target_type: 'ContentItem',
      target_id: 'cnt-001',
    });
  });

  it('swaps the file: rebuilds share targets and removes the old object', async () => {
    const nextUrl =
      'https://ref.supabase.co/storage/v1/object/public/marketing-tools/cms/1756111111-zz99-new.pdf';
    const { res, seen } = capture();
    await handler(patchReq('cnt-001', { downloadUrl: nextUrl }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'cnt-001', downloadUrl: nextUrl });
    const update = mocks.calls.find((c) => c.table === 'ContentItem' && c.op === 'update');
    const share = (update?.arg as Record<string, unknown>)?.share as Record<string, string>;
    expect(share.copyUrl).toBe(nextUrl);
    expect(share.messengerUrl).toContain(encodeURIComponent(nextUrl));
    const removal = mocks.calls.find((c) => c.table === 'storage:marketing-tools');
    expect(removal?.arg).toEqual(['cms/1756000000-ab12cd-showcase.pdf']);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(String(audit.detail)).toContain('file replaced');
  });

  it('skips old-object removal for external previous URLs', async () => {
    mocks.script.item = { ...BUCKET_ITEM, download_url: 'https://example.com/files/old.pdf' };
    const nextUrl =
      'https://ref.supabase.co/storage/v1/object/public/marketing-tools/cms/1756111111-zz99-new.pdf';
    const { res, seen } = capture();
    await handler(patchReq('cnt-001', { downloadUrl: nextUrl }), res);
    expect(seen.status).toBe(200);
    expect(mocks.calls.some((c) => c.table === 'storage:marketing-tools')).toBe(false);
  });

  it('detaches the file on explicit null: clears URL/share and removes the old object', async () => {
    const { res, seen } = capture();
    await handler(patchReq('cnt-001', { downloadUrl: null }), res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'cnt-001', title: 'Showcase Flyer' });
    expect((seen.body as Record<string, unknown>).downloadUrl).toBeUndefined();
    const update = mocks.calls.find((c) => c.table === 'ContentItem' && c.op === 'update');
    expect(update?.arg).toMatchObject({ download_url: null, share: null });
    const removal = mocks.calls.find((c) => c.table === 'storage:marketing-tools');
    expect(removal?.arg).toEqual(['cms/1756000000-ab12cd-showcase.pdf']);
    const audit = mocks.calls.find((c) => c.table === 'AuditLog')?.arg as Record<string, unknown>;
    expect(String(audit.detail)).toContain('file removed');
  });
});
