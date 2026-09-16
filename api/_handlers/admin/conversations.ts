import { adminConversationSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';

/**
 * GET /admin/conversations - staff inbox (API-SPECIFICATION #90): one row
 * per member with a thread, newest activity first. Page-based (`?page=`,
 * `?pageSize=` default 50, max 100). Module-gated `messages`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaffModule(req, 'messages', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const query = req.query as Record<string, string | string[] | undefined>;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const rawPage = Number(first(query.page) ?? 1);
  const rawSize = Number(first(query.pageSize) ?? 50);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawSize) && rawSize > 0 ? Math.min(Math.floor(rawSize), 100) : 50;

  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Conversation')
    .select('memberId,lastMessageAt,staffUnread')
    .order('lastMessageAt', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const conversations = ((data as unknown[]) ?? []) as Record<string, unknown>[];
  const memberIds = conversations
    .map((c) => c.memberId)
    .filter((id): id is string => typeof id === 'string');
  let membersById = new Map<string, { name?: unknown; email?: unknown }>();
  let previews = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: memberRows } = await supabase
      .from('Member')
      .select('id,name,email')
      .in('id', memberIds);
    membersById = new Map(
      (((memberRows as unknown[]) ?? []) as Record<string, unknown>[]).map((m) => [
        m.id as string,
        { name: m.name, email: m.email },
      ]),
    );
    // Latest message body per thread for the inbox preview.
    const { data: previewRows } = await supabase
      .from('Message')
      .select('memberId,body,createdAt')
      .in('memberId', memberIds)
      .order('createdAt', { ascending: false });
    for (const row of ((previewRows as unknown[]) ?? []) as Record<string, unknown>[]) {
      const key = row.memberId as string;
      if (typeof key === 'string' && !previews.has(key) && typeof row.body === 'string') {
        previews.set(key, row.body.slice(0, 140));
      }
    }
  }
  const rows = conversations
    .map((c) => {
      const memberId = c.memberId as string;
      const member = membersById.get(memberId);
      return adminConversationSchema.safeParse({
        memberId,
        memberName: typeof member?.name === 'string' && member.name ? member.name : 'Member',
        memberEmail: typeof member?.email === 'string' ? member.email : '',
        lastMessageAt: typeof c.lastMessageAt === 'string' ? c.lastMessageAt : undefined,
        lastMessagePreview: previews.get(memberId),
        unreadCount: typeof c.staffUnread === 'number' ? c.staffUnread : 0,
      });
    })
    .filter((r) => r.success)
    .map((r) => (r as { data: unknown }).data);
  okList(res, rows);
}
