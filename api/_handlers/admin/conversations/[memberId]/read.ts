import { markMessagesReadResponseSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../../_lib/access.js';
import { verifyStaffModule } from '../../../../_lib/auth.js';
import { toErrorEnvelope } from '../../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../../_lib/rest.js';

/**
 * POST /admin/conversations/:memberId/read - mark a member's thread read for
 * staff (API-SPECIFICATION #93). Upserts the Conversation watermark
 * (staffLastReadAt=now, staffUnread=0); idempotent, also creates the
 * watermark when the member has no thread yet.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaffModule(req, 'messages', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const memberId = Array.isArray(req.query.memberId) ? req.query.memberId[0] : req.query.memberId;
  if (!memberId) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Member id is required.', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('Conversation')
    .upsert(
      { memberId, staffLastReadAt: now, staffUnread: 0, updatedAt: now },
      { onConflict: '"memberId"' },
    )
    .select('memberId')
    .maybeSingle();
  if (error || !data) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      error?.message ?? 'Read watermark failed.',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  const parsed = markMessagesReadResponseSchema.safeParse({ readAt: now });
  if (!parsed.success) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', 'Read failed validation', 500);
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsed.data);
}
