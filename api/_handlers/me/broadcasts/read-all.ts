import { readAllNotificationsResponseSchema } from '@jad/contracts';

import { verifyUser } from '../../../_lib/auth.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';

/**
 * POST /me/broadcasts/read-all - read receipts for every visible unread
 * notification (own + broadcasts). Idempotent: already-read rows are
 * skipped, so re-calling returns `{ updated: 0 }`.
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
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: visible, error: visibleError } = await supabase
    .from('Notification')
    .select('id,read_at')
    .or(`member_id.is.null,member_id.eq.${auth.userId}`);
  if (visibleError) {
    const { error, status } = toErrorEnvelope('INTERNAL', visibleError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const { data: existing, error: existingError } = await supabase
    .from('NotificationRead')
    .select('notificationId')
    .eq('memberId', auth.userId);
  if (existingError) {
    const { error, status } = toErrorEnvelope('INTERNAL', existingError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const readIds = new Set(
    ((existing as { notificationId?: unknown }[] | null) ?? [])
      .map((r) => r.notificationId)
      .filter((v): v is string => typeof v === 'string'),
  );
  const now = new Date().toISOString();
  // Only genuinely unread rows (no receipt AND no legacy row read_at,
  // matching the GET merge) - otherwise the count would claim work the
  // client already renders as read.
  const pending = (
    ((visible as { id?: unknown; read_at?: unknown }[] | null) ?? []) as {
      id?: unknown;
      read_at?: unknown;
    }[]
  )
    .filter((row) => typeof row.id === 'string' && !readIds.has(row.id) && row.read_at == null)
    .map((row) => ({ notificationId: row.id as string, memberId: auth.userId, readAt: now }));
  if (pending.length > 0) {
    const { error: upsertError } = await supabase.from('NotificationRead').upsert(pending, {
      onConflict: '"notificationId","memberId"',
    });
    if (upsertError) {
      const { error, status } = toErrorEnvelope('INTERNAL', upsertError.message, 500);
      res.status(status).json({ error });
      return;
    }
  }
  const parsed = readAllNotificationsResponseSchema.safeParse({ updated: pending.length });
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Read-all failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(parsed.data);
}
