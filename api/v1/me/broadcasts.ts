import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidNotificationRow, mapNotificationRow } from '../../_lib/mappers.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** Merge per-member read receipts over notification rows. A broadcast row
 * (member_id NULL) is shared, so its row read_at can never mark it read for
 * one member — the receipt is the SSOT. Member-scoped rows fall back to the
 * row read_at (legacy/seed state converged by the NotificationRead backfill).
 */
export function mergeReadReceipts(
  notifications: Record<string, unknown>[],
  receipts: { notificationId?: unknown; readAt?: unknown; read_at?: unknown }[],
): Record<string, unknown>[] {
  const byNotification = new Map<string, string>();
  for (const receipt of receipts) {
    if (typeof receipt.notificationId === 'string' && typeof receipt.readAt === 'string') {
      byNotification.set(receipt.notificationId, receipt.readAt);
    } else if (typeof receipt.notificationId === 'string' && typeof receipt.read_at === 'string') {
      byNotification.set(receipt.notificationId, receipt.read_at);
    }
  }
  return notifications.map((row) => {
    const receipt = typeof row.id === 'string' ? byNotification.get(row.id) : undefined;
    return { ...row, readAt: receipt ?? row.readAt ?? row.read_at ?? undefined };
  });
}

/**
 * GET /me/broadcasts — own + broadcast notifications, newest first
 * (API-SPECIFICATION #73). Per-member `readAt` merges NotificationRead
 * receipts over the row state.
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
    .from('Notification')
    .select('id, title, body, read_at, created_at')
    .or(`member_id.is.null,member_id.eq.${auth.userId}`)
    .order('created_at', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const notifications = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(
    mapNotificationRow,
  );
  // Read receipts (missing table pre-migration degrades to row state).
  let receipts: { notificationId?: unknown; readAt?: unknown; read_at?: unknown }[] = [];
  try {
    const { data: receiptRows, error: receiptError } = await supabase
      .from('NotificationRead')
      .select('notificationId,readAt')
      .eq('memberId', auth.userId);
    if (!receiptError && Array.isArray(receiptRows)) {
      receipts = receiptRows as typeof receipts;
    }
  } catch {
    // pre-migration: no receipts table — row state stands alone.
  }
  const rows = mergeReadReceipts(notifications, receipts);
  okList(res, rows.filter(isValidNotificationRow));
}
