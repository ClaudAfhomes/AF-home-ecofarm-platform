import { verifyUser } from '../../../../_lib/auth.js';
import { appendAudit } from '../../../../_lib/audit.js';
import type { VercelRequest, VercelResponse } from '../../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../../_lib/envelope.js';

/** POST /me/sales/:id/reopen-request — LOCKED-only reopen request. */
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
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Not found', 404);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('Sale')
    .select('id, status, propertyName, customerName')
    .eq('id', id)
    .eq('sellerId', auth.userId)
    .maybeSingle();
  if (readError) {
    const { error, status } = toErrorEnvelope('INTERNAL', readError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Not found', 404);
    res.status(status).json({ error });
    return;
  }
  const row = found as { id: string; status: string; propertyName: string; customerName: string };
  if (row.status !== 'LOCKED') {
    const { error, status } = toErrorEnvelope('CONFLICT', 'Only a locked sale can be reopened by request.', 409);
    res.status(status).json({ error });
    return;
  }
  const now = new Date().toISOString();
  const { error: writeError } = await supabase
    .from('Sale')
    .update({ reopenRequested: true, reopenRequestedAt: now, updatedAt: now })
    .eq('id', id);
  if (writeError) {
    const { error, status } = toErrorEnvelope('INTERNAL', writeError.message, 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'SALE_REOPEN_REQUESTED',
    actorId: auth.userId,
    actorRole: 'user',
    targetType: 'Sale',
    targetId: id,
    targetName: `${row.propertyName} — ${row.customerName}`,
    detail: `Requested reopen of locked sale ${id}`,
  });
  res.status(200).json({ saleId: id, requested: true });
}
