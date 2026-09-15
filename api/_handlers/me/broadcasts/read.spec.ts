import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

import readHandler from './[id]/read.js';
import readAllHandler from './read-all.js';
import { mergeReadReceipts } from '../broadcasts.js';

/**
 * Member read receipts: POST /me/broadcasts/:id/read (single, idempotent)
 * and POST /me/broadcasts/read-all, plus the GET receipt-merge pure
 * function. Supabase is fully mocked.
 */
const mocks = vi.hoisted(() => {
  const calls: { op: string; table?: string; arg?: unknown }[] = [];
  const script = {
    visibleRow: null as unknown,
    visibleRows: [] as unknown[],
    existingReceipts: [] as unknown[],
    receipt: null as unknown,
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.or = () => chain;
    chain.is = () => chain;
    chain.order = () => chain;
    chain.maybeSingle = async () => {
      if (table === 'Notification') return { data: script.visibleRow, error: null };
      if (table === 'NotificationRead') return { data: script.receipt, error: null };
      return { data: null, error: null };
    };
    chain.upsert = (rows: unknown) => {
      calls.push({ op: 'upsert', table, arg: rows });
      return {
        error: null,
        select: () => ({
          maybeSingle: () => Promise.resolve({ data: script.receipt, error: null }),
        }),
      };
    };
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'Notification') resolve({ data: script.visibleRows, error: null });
      else if (table === 'NotificationRead')
        resolve({ data: script.existingReceipts, error: null });
      else resolve({ data: [], error: null });
    };
    return chain;
  };
  return {
    calls,
    script,
    service: { from: (table: string) => chainFor(table) },
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
const READ_ROW = { id: 'ntf-002', member_id: null };

describe('mergeReadReceipts', () => {
  it('prefers the receipt over the row state', () => {
    const merged = mergeReadReceipts(
      [
        { id: 'a', readAt: undefined },
        { id: 'b', read_at: '2026-09-01T00:00:00.000Z' },
      ],
      [{ notificationId: 'a', readAt: '2026-09-14T10:00:00.000Z' }],
    );
    expect(merged).toMatchObject([
      { id: 'a', readAt: '2026-09-14T10:00:00.000Z' },
      { id: 'b', readAt: '2026-09-01T00:00:00.000Z' },
    ]);
  });
});

describe('POST /me/broadcasts/:id/read', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://member.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.visibleRow = READ_ROW;
    mocks.script.receipt = { notificationId: 'ntf-002', readAt: '2026-09-14T10:00:00.000Z' };
  });

  it('401s without credentials and 404s invisible rows', async () => {
    const anon = capture();
    await readHandler(
      { method: 'POST', query: { id: 'ntf-002' }, headers: {} } as VercelRequest,
      anon.res,
    );
    expect(anon.seen.status).toBe(401);

    mocks.script.visibleRow = null;
    const missing = capture();
    await readHandler(
      { method: 'POST', query: { id: 'ntf-999' }, headers: authed } as VercelRequest,
      missing.res,
    );
    expect(missing.seen.status).toBe(404);
  });

  it('upserts the receipt and returns it (idempotent)', async () => {
    const { res, seen } = capture();
    await readHandler(
      { method: 'POST', query: { id: 'ntf-002' }, headers: authed } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ id: 'ntf-002' });
    const upsert = mocks.calls.find((c) => c.op === 'upsert' && c.table === 'NotificationRead')
      ?.arg as { notificationId?: string; memberId?: string };
    expect(upsert).toMatchObject({ notificationId: 'ntf-002', memberId: 'mem-uuid-1' });
  });
});

describe('POST /me/broadcasts/read-all', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://member.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.calls.length = 0;
    mocks.script.visibleRows = [
      { id: 'ntf-001', read_at: null },
      { id: 'ntf-002', read_at: '2026-09-01T00:00:00.000Z' },
      { id: 'ntf-003', read_at: null },
    ];
    mocks.script.existingReceipts = [{ notificationId: 'ntf-003' }];
  });

  it('receipts only the genuinely unread rows and returns the count', async () => {
    const { res, seen } = capture();
    await readAllHandler({ method: 'POST', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ updated: 1 });
    const upsert = mocks.calls.find((c) => c.op === 'upsert' && c.table === 'NotificationRead')
      ?.arg as { notificationId?: string }[];
    expect(upsert.map((r) => r.notificationId)).toEqual(['ntf-001']);
  });

  it('returns zero when nothing is unread', async () => {
    mocks.script.existingReceipts = [{ notificationId: 'ntf-001' }, { notificationId: 'ntf-003' }];
    const { res, seen } = capture();
    await readAllHandler({ method: 'POST', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ updated: 0 });
    expect(mocks.calls.some((c) => c.op === 'upsert')).toBe(false);
  });
});
