import { ADMIN_STAFF } from '../../../../_lib/access.js';
import { verifyStaffModule } from '../../../../_lib/auth.js';
import { appendAudit } from '../../../../_lib/audit.js';
import type { VercelRequest, VercelResponse } from '../../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../../_lib/envelope.js';

/** POST /admin/members/:id/archive — move to archives with a snapshot (no hard delete). */
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
  const auth = await verifyStaffModule(req, 'members', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Member id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('Member')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    const { error, status } = toErrorEnvelope('INTERNAL', readError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Member not found', 404);
    res.status(status).json({ error });
    return;
  }
  const row = found as Record<string, unknown>;
  if (row.archivedAt) {
    const { error, status } = toErrorEnvelope('CONFLICT', 'Member is already archived.', 409);
    res.status(status).json({ error });
    return;
  }
  const now = new Date().toISOString();
  const { error: writeError } = await supabase
    .from('Member')
    .update({ archivedAt: now, archivedBy: auth.userId, archiveSnapshot: row })
    .eq('id', id);
  if (writeError) {
    const { error, status } = toErrorEnvelope('INTERNAL', writeError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const displayName = `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || String(row.name ?? id);
  await appendAudit(supabase, {
    action: 'MEMBER_ARCHIVED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Member',
    targetId: id,
    targetName: displayName,
    detail: `Archived member ${displayName}`,
  });
  res.status(200).json({ archivedId: id });
}
