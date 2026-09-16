import { ADMIN_STAFF } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidNotificationRow, mapNotificationRow } from '../../_lib/mappers.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';

/**
 * GET /admin/broadcasts - every broadcast announcement (Notification rows
 * with member_id NULL), newest first. Powers the admin Broadcasts composer
 * (SCR-ADM-016). Member-scoped rows are out of scope - admins manage
 * announcements here, not per-member notifications.
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
  const auth = await verifyStaffModule(req, 'marketing_tools', ADMIN_STAFF);
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
    .is('member_id', null)
    .order('created_at', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapNotificationRow);
  okList(res, rows.filter(isValidNotificationRow));
}
