import { payoutAccountSchema } from '@jad/contracts';

import { FINANCE_VIEW } from '../../../_lib/access.js';
import { appendAudit } from '../../../_lib/audit.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { mapPayoutAccountRow } from '../../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/**
 * PATCH /admin/payouts/:id - verify (PENDING/ADMIN_REVIEW → CONFIRMED) or
 * reject (→ REJECTED, reason mandatory, ≤500 chars). Finance works the
 * verification queue; every decision is audited.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'PATCH') {
    methodNotAllowed(res, req.method);
    return;
  }
  const auth = await verifyStaffModule(req, 'payouts', FINANCE_VIEW);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Payout account id is required',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const input = (parsedBody.body ?? {}) as Record<string, unknown>;
  const status = typeof input.status === 'string' ? input.status : '';
  const reason = typeof input.rejectionReason === 'string' ? input.rejectionReason.trim() : '';
  if (status !== 'CONFIRMED' && status !== 'REJECTED') {
    const { error, status: code } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'status must be CONFIRMED or REJECTED.',
      400,
    );
    res.status(code).json({ error });
    return;
  }
  if (status === 'REJECTED' && !reason) {
    const { error, status: code } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Rejection reason is required.',
      400,
    );
    res.status(code).json({ error });
    return;
  }
  if (reason.length > 500) {
    const { error, status: code } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Rejection reason must be 500 characters or fewer.',
      400,
    );
    res.status(code).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('PayoutAccount')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError || !found) {
    const { error, status: code } = toErrorEnvelope('NOT_FOUND', 'Payout account not found', 404);
    res.status(code).json({ error });
    return;
  }
  const current = found as Record<string, unknown>;
  if (current.status !== 'PENDING' && current.status !== 'ADMIN_REVIEW') {
    const { error, status: code } = toErrorEnvelope(
      'CONFLICT',
      `Only pending accounts can be reviewed (current: ${current.status}).`,
      409,
    );
    res.status(code).json({ error });
    return;
  }
  const patch =
    status === 'CONFIRMED'
      ? { status, rejectionReason: null }
      : { status, rejectionReason: reason };
  const { data: updated, error: updateError } = await supabase
    .from('PayoutAccount')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (updateError || !updated) {
    const { error, status: code } = toErrorEnvelope(
      'INTERNAL',
      updateError?.message ?? 'Update failed',
      500,
    );
    res.status(code).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: status === 'CONFIRMED' ? 'PAYOUT_CONFIRMED' : 'PAYOUT_REJECTED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'PayoutAccount',
    targetId: id,
    targetName: `${String(current.accountName ?? id)} - ${String(current.method ?? '')}`,
    detail:
      status === 'CONFIRMED'
        ? `Confirmed payout account ${id}`
        : `Rejected payout account ${id}: ${reason}`,
  });
  const parsed = payoutAccountSchema.safeParse(
    mapPayoutAccountRow(updated as Record<string, unknown>),
  );
  if (!parsed.success) {
    const { error, status: code } = toErrorEnvelope(
      'INTERNAL',
      'Stored payout account failed validation',
      500,
    );
    res.status(code).json({ error });
    return;
  }
  res.status(200).json(parsed.data);
}
