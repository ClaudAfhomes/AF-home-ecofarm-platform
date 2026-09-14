import { markNotificationReadResponseSchema } from '@jad/contracts';

import { verifyUser } from '../../../../_lib/auth.js';
import { toErrorEnvelope } from '../../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../../_lib/rest.js';

/**
 * POST /me/broadcasts/:id/read — per-member read receipt for one visible
 * notification (own row or broadcast). Idempotent: re-marking returns the
 * existing receipt. Broadcast rows are shared, so per-member state lives in
 * NotificationRead (never on the broadcast row itself).
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
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Notification id is required.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  // Visibility gate: the notification must be own or a broadcast (404
  // otherwise — a foreign member-scoped row is never leaked).
  const { data: visible, error: visibleError } = await supabase
    .from('Notification')
    .select('id')
    .eq('id', id)
    .or(`member_id.is.null,member_id.eq.${auth.userId}`)
    .maybeSingle();
  if (visibleError) {
    const { error, status } = toErrorEnvelope('INTERNAL', visibleError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!visible) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Notification not found.', 404);
    res.status(status).json({ error });
    return;
  }
  const now = new Date().toISOString();
  const { data: receipt, error: receiptError } = await supabase
    .from('NotificationRead')
    .upsert(
      { notificationId: id, memberId: auth.userId, readAt: now },
      {
        onConflict: '"notificationId","memberId"',
      },
    )
    .select('notificationId,readAt')
    .maybeSingle();
  if (receiptError) {
    const { error, status } = toErrorEnvelope('INTERNAL', receiptError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const parsed = markNotificationReadResponseSchema.safeParse({
    id,
    readAt: (receipt as { readAt?: unknown } | null)?.readAt ?? now,
  });
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Receipt failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(parsed.data);
}
