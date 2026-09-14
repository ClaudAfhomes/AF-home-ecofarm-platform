import { conversationSummarySchema } from '@jad/contracts';

import { verifyUser } from '../../../_lib/auth.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';

/**
 * GET /me/messages/summary — member thread badge (API-SPECIFICATION #93):
 * unread staff replies + last message time. No Conversation row yet means
 * no thread: `{ unreadCount: 0 }`.
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
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Conversation')
    .select('memberUnread,lastMessageAt')
    .eq('memberId', auth.userId)
    .maybeSingle();
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const row = (data ?? {}) as { memberUnread?: unknown; lastMessageAt?: unknown };
  const parsed = conversationSummarySchema.safeParse({
    unreadCount: typeof row.memberUnread === 'number' ? row.memberUnread : 0,
    lastMessageAt: typeof row.lastMessageAt === 'string' ? row.lastMessageAt : undefined,
  });
  if (!parsed.success) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', 'Summary failed validation', 500);
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsed.data);
}
