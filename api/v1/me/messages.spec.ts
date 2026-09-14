import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './messages.js';
import readHandler from './messages/read.js';
import summaryHandler from './messages/summary.js';

/** GET/POST /me/messages + read/summary. Supabase is fully mocked. */
const mocks = vi.hoisted(() => {
  const script = {
    messages: [] as unknown[],
    listError: null as string | null,
    inserted: null as unknown,
    insertError: null as string | null,
    member: { name: 'Juan Member', email: 'juan@example.com' } as unknown,
    conversation: null as unknown,
  };
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.or = () => chain;
    chain.order = () => chain;
    chain.upsert = () => chain;
    chain.insert = () => chain;
    chain.maybeSingle = async () => {
      if (table === 'Member') return { data: script.member, error: null };
      if (table === 'Conversation')
        return { data: script.conversation ?? { memberId: 'member-uuid-1' }, error: null };
      return { data: null, error: null };
    };
    chain.single = async () => {
      if (table === 'Message') {
        return script.insertError
          ? { data: null, error: new Error(script.insertError) }
          : { data: script.inserted, error: null };
      }
      return { data: null, error: null };
    };
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'Message') {
        resolve({
          data: script.messages,
          error: script.listError ? new Error(script.listError) : null,
        });
      } else {
        resolve({ data: [], error: null });
      }
    };
    return chain;
  };
  return {
    script,
    service: { from: (table: string) => chainFor(table) },
    anon: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'member-uuid-1' } }, error: null }),
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
const row = (id: string, senderType: string, createdAt: string) => ({
  id,
  senderType,
  senderName: senderType === 'STAFF' ? 'Ada Admin' : 'Juan Member',
  body: `body ${id}`,
  createdAt,
});

describe('GET /me/messages', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://member.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.messages = [
      row('msg-2', 'STAFF', '2026-09-14T11:00:00.000Z'),
      row('msg-1', 'MEMBER', '2026-09-14T10:00:00.000Z'),
    ];
    mocks.script.listError = null;
    mocks.script.conversation = null;
  });

  it('401s without credentials', async () => {
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: {} } as VercelRequest, res);
    expect(seen.status).toBe(401);
  });

  it('200s the thread newest first with a cursor envelope', async () => {
    const { res, seen } = capture();
    await handler(
      { method: 'GET', query: { limit: '1' }, headers: authed } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      data: [{ id: 'msg-2' }],
      meta: { pagination: { nextCursor: 'msg-2' } },
    });
  });

  it('500s when the thread read fails', async () => {
    mocks.script.listError = 'db down';
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(500);
  });
});

describe('POST /me/messages', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://member.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.inserted = row('msg-3', 'MEMBER', '2026-09-14T12:00:00.000Z');
    mocks.script.insertError = null;
  });

  it('400s an empty body and 201s a member message', async () => {
    const bad = capture();
    await handler(
      { method: 'POST', query: {}, headers: authed, body: { body: '   ' } } as VercelRequest,
      bad.res,
    );
    expect(bad.seen.status).toBe(400);

    const { res, seen } = capture();
    await handler(
      { method: 'POST', query: {}, headers: authed, body: { body: 'Hello' } } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({ id: 'msg-3', senderType: 'MEMBER' });
  });
});

describe('POST /me/messages/read + GET /me/messages/summary', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://member.test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    mocks.script.conversation = null;
  });

  it('200s the watermark and the summary', async () => {
    const read = capture();
    await readHandler({ method: 'POST', query: {}, headers: authed } as VercelRequest, read.res);
    expect(read.seen.status).toBe(200);
    expect(read.seen.body).toMatchObject({ readAt: expect.any(String) });

    mocks.script.conversation = { memberUnread: 2, lastMessageAt: '2026-09-14T11:00:00.000Z' };
    const summary = capture();
    await summaryHandler(
      { method: 'GET', query: {}, headers: authed } as VercelRequest,
      summary.res,
    );
    expect(summary.seen.status).toBe(200);
    expect(summary.seen.body).toMatchObject({ unreadCount: 2 });
  });

  it('summarizes an empty thread as zero', async () => {
    const { res, seen } = capture();
    await summaryHandler({ method: 'GET', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ unreadCount: 0 });
  });
});
