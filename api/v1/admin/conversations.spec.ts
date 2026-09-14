import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';

import handler from './conversations.js';
import threadHandler from './conversations/[memberId].js';
import replyHandler from './conversations/[memberId]/messages.js';
import readHandler from './conversations/[memberId]/read.js';
import summaryHandler from './messages/summary.js';

/** Staff messaging endpoints. Supabase is fully mocked (mirrors the broadcasts specs). */
const mocks = vi.hoisted(() => {
  const auditCalls: unknown[] = [];
  const fresh = () => ({
    roleSlug: 'admin',
    rolePermissions: [] as unknown[],
    conversations: [] as unknown[],
    readError: null as string | null,
    members: [] as unknown[],
    messages: [] as unknown[],
    threadError: null as string | null,
    threadConversation: null as unknown,
    memberExists: true,
    inserted: null as unknown,
    insertError: null as string | null,
    staffName: 'Ada Admin',
  });
  const script = fresh();
  const reset = () => Object.assign(script, fresh());
  const chainFor = (table: string) => {
    const chain: Record<string, (...a: never[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.or = () => chain;
    chain.is = () => chain;
    chain.order = () => chain;
    chain.in = () => chain;
    chain.upsert = () => chain;
    chain.insert = (...a: never[]) => {
      if (table === 'AuditLog') {
        auditCalls.push(a[0]);
        return Promise.resolve({ error: null });
      }
      return chain;
    };
    chain.range = async () => ({
      data: script.conversations,
      error: script.readError ? new Error(script.readError) : null,
    });
    chain.maybeSingle = async () => {
      if (table === 'Member')
        return { data: script.memberExists ? { id: 'member-uuid-1' } : null, error: null };
      if (table === 'StaffUser') return { data: { name: script.staffName }, error: null };
      if (table === 'Conversation') return { data: script.threadConversation, error: null };
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
      if (table === 'StaffUser') {
        resolve({ data: [{ status: 'ACTIVE', mustChangePassword: false }], error: null });
      } else if (table === 'StaffAssignment') {
        resolve({ data: [{ roleId: 'r-admin' }], error: null });
      } else if (table === 'Role') {
        resolve({
          data: [{ slug: script.roleSlug, permissions: script.rolePermissions }],
          error: null,
        });
      } else if (table === 'Conversation') {
        resolve({
          data: script.conversations,
          error: script.readError ? new Error(script.readError) : null,
        });
      } else if (table === 'Member') {
        resolve({ data: script.members, error: null });
      } else if (table === 'Message') {
        resolve({
          data: script.messages,
          error: script.threadError ? new Error(script.threadError) : null,
        });
      } else {
        resolve({ data: [], error: null });
      }
    };
    return chain;
  };
  return {
    auditCalls,
    script,
    reset,
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

function stubEnv() {
  vi.stubEnv('SUPABASE_URL', 'https://staff.test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
}

const authed = { authorization: 'Bearer good' };
const conversation = (memberId: string, staffUnread: number) => ({
  memberId,
  lastMessageAt: '2026-09-14T11:00:00.000Z',
  staffUnread,
});
const message = (id: string, senderType: string, createdAt: string) => ({
  id,
  senderType,
  senderName: senderType === 'STAFF' ? 'Ada Admin' : 'Juan Member',
  body: `preview ${id} with enough text`,
  createdAt,
});

describe('GET /admin/conversations', () => {
  beforeEach(() => {
    stubEnv();
    mocks.reset();
    mocks.auditCalls.length = 0;
    mocks.script.conversations = [conversation('member-uuid-1', 1)];
    mocks.script.members = [{ id: 'member-uuid-1', name: 'Juan', email: 'juan@example.com' }];
    mocks.script.messages = [message('msg-2', 'MEMBER', '2026-09-14T11:00:00.000Z')];
  });

  it('401s without credentials and 403s non-staff slugs', async () => {
    const anon = capture();
    await handler({ method: 'GET', query: {}, headers: {} } as VercelRequest, anon.res);
    expect(anon.seen.status).toBe(401);

    mocks.script.roleSlug = 'merchant';
    const merchant = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, merchant.res);
    expect(merchant.seen.status).toBe(403);
  });

  it('200s the inbox with member details and previews', async () => {
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      data: [{ memberId: 'member-uuid-1', memberName: 'Juan', unreadCount: 1 }],
    });
  });

  it('500s when the inbox read fails', async () => {
    mocks.script.readError = 'db down';
    const { res, seen } = capture();
    await handler({ method: 'GET', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(500);
  });
});

describe('GET /admin/conversations/:memberId', () => {
  beforeEach(() => {
    stubEnv();
    mocks.reset();
    mocks.script.threadConversation = { memberId: 'member-uuid-1' };
    mocks.script.messages = [
      message('msg-2', 'MEMBER', '2026-09-14T11:00:00.000Z'),
      message('msg-1', 'STAFF', '2026-09-14T10:00:00.000Z'),
    ];
  });

  it('404s members without a thread', async () => {
    mocks.script.threadConversation = null;
    const { res, seen } = capture();
    await threadHandler(
      { method: 'GET', query: { memberId: 'member-uuid-9' }, headers: authed } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(404);
  });

  it('200s the thread newest first', async () => {
    const { res, seen } = capture();
    await threadHandler(
      { method: 'GET', query: { memberId: 'member-uuid-1' }, headers: authed } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ data: [{ id: 'msg-2' }, { id: 'msg-1' }] });
  });
});

describe('POST /admin/conversations/:memberId/messages', () => {
  beforeEach(() => {
    stubEnv();
    mocks.reset();
    mocks.auditCalls.length = 0;
    mocks.script.inserted = message('msg-3', 'STAFF', '2026-09-14T12:00:00.000Z');
  });

  it('404s unknown members, 400s empty bodies, 201s and audits replies', async () => {
    mocks.script.memberExists = false;
    const missing = capture();
    await replyHandler(
      {
        method: 'POST',
        query: { memberId: 'member-uuid-9' },
        headers: authed,
        body: { body: 'Hi' },
      } as VercelRequest,
      missing.res,
    );
    expect(missing.seen.status).toBe(404);

    mocks.script.memberExists = true;
    const bad = capture();
    await replyHandler(
      {
        method: 'POST',
        query: { memberId: 'member-uuid-1' },
        headers: authed,
        body: { body: '' },
      } as VercelRequest,
      bad.res,
    );
    expect(bad.seen.status).toBe(400);

    const { res, seen } = capture();
    await replyHandler(
      {
        method: 'POST',
        query: { memberId: 'member-uuid-1' },
        headers: authed,
        body: { body: 'We can help.' },
      } as VercelRequest,
      res,
    );
    expect(seen.status).toBe(201);
    expect(seen.body).toMatchObject({ id: 'msg-3', senderType: 'STAFF' });
    expect(mocks.auditCalls).toHaveLength(1);
    expect(mocks.auditCalls[0]).toMatchObject({
      action: 'MESSAGE_SENT',
      target_type: 'Conversation',
      target_id: 'member-uuid-1',
    });
  });
});

describe('staff read + summary', () => {
  beforeEach(() => {
    stubEnv();
    mocks.reset();
    mocks.script.threadConversation = { memberId: 'member-uuid-1' };
    mocks.script.conversations = [conversation('member-uuid-1', 2), conversation('m2', 0)];
  });

  it('200s the watermark and the aggregate summary', async () => {
    const read = capture();
    await readHandler(
      {
        method: 'POST',
        query: { memberId: 'member-uuid-1' },
        headers: authed,
      } as VercelRequest,
      read.res,
    );
    expect(read.seen.status).toBe(200);
    expect(read.seen.body).toMatchObject({ readAt: expect.any(String) });

    const { res, seen } = capture();
    await summaryHandler({ method: 'GET', query: {}, headers: authed } as VercelRequest, res);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ unreadCount: 2, unreadConversations: 1 });
  });
});
