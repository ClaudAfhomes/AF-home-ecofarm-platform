import { ADMIN_STAFF, FINANCE_VIEW } from '../../../_lib/access.js';
import { appendAudit } from '../../../_lib/audit.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { isValidVoucherAssignmentRow, mapVoucherAssignmentRow } from '../../../_lib/pipeline.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/**
 * GET /admin/vouchers/:id (super_admin, admin, finance).
 * DELETE (super_admin, admin) — unassign, audited.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    methodNotAllowed(res, req.method);
    return;
  }
  const allowed = req.method === 'GET' ? FINANCE_VIEW : ADMIN_STAFF;
  const auth = await verifyStaffModule(req, 'vouchers', allowed);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Voucher id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('Voucher')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError || !found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Voucher not found', 404);
    res.status(status).json({ error });
    return;
  }
  const current = found as Record<string, unknown>;
  if (req.method === 'GET') {
    // Admin detail view carries the member linkage (assignment shape).
    if (!isValidVoucherAssignmentRow(current)) {
      const { error, status } = toErrorEnvelope(
        'INTERNAL',
        'Stored voucher failed validation',
        500,
      );
      res.status(status).json({ error });
      return;
    }
    res.status(200).json(mapVoucherAssignmentRow(current));
    return;
  }
  const { error } = await supabase.from('Voucher').delete().eq('id', id);
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  await appendAudit(supabase, {
    action: 'VOUCHER_UNASSIGNED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Voucher',
    targetId: id,
    targetName: `${String(current.title ?? id)} — ${String(current.memberName ?? '')}`,
    detail: `Unassigned voucher ${id}`,
  });
  res.status(200).json({ id, deleted: true });
}
