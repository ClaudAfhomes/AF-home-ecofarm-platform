import { auditLogEntrySchema } from '@jad/contracts';

import { SUPER_ADMIN_ONLY } from '../../_lib/access.js';
import { verifyStaff } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET /admin/audit-log — newest first, capped page size (super_admin only). */
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
  const auth = await verifyStaff(req, [...SUPER_ADMIN_ONLY]);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(Number.parseInt(rawLimit ?? '50', 10) || 50, 1), 200);
  const { data, error } = await supabase
    .from('AuditLog')
    .select('id,action,actor_id,actor_role,target_type,target_id,target_name,detail,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const actorIds = [
    ...new Set(
      (((data as unknown[]) ?? []) as Record<string, unknown>[])
        .map((row) => row.actor_id)
        .filter((id): id is string => typeof id === 'string' && id !== ''),
    ),
  ];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: members } = await supabase.from('Member').select('id,name').in('id', actorIds);
    for (const m of ((members as { id: string; name: string | null }[] | null) ?? [])) {
      names.set(m.id, m.name || m.id);
    }
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    action: row.action,
    actor:
      typeof row.actor_id === 'string' && row.actor_id
        ? (names.get(row.actor_id) ?? row.actor_id)
        : 'System',
    actorRole: row.actor_role ?? 'SYSTEM',
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    detail: row.detail ?? '',
    createdAt: row.created_at,
  }));
  okList(res, rows.filter((row) => auditLogEntrySchema.safeParse(row).success));
}
