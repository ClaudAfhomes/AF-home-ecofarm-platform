import { adminMessagesSummarySchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';

/**
 * GET /admin/messages/summary — staff inbox badge (API-SPECIFICATION #94):
 * total unread member messages plus the count of threads holding them.
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
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase.from('Conversation').select('staffUnread');
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const counts = ((((data as unknown[]) ?? []) as Record<string, unknown>[]).map((c) =>
    typeof c.staffUnread === 'number' ? c.staffUnread : 0,
  ));
  const parsed = adminMessagesSummarySchema.safeParse({
    unreadCount: counts.reduce((sum, n) => sum + n, 0),
    unreadConversations: counts.filter((n) => n > 0).length,
  });
  if (!parsed.success) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', 'Summary failed validation', 500);
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsed.data);
}
