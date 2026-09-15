import { setPrimaryPayoutAccountRequestSchema } from '@jad/contracts';

import { verifyUser } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { mapPayoutAccountRow } from '../../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/**
 * PATCH /me/payout-accounts/:id — designate the single primary
 * (CONFIRMED-only, BR-PAY-006). DELETE removes PENDING non-primary accounts
 * (typo remediation).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
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
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Payout account id is required',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('PayoutAccount')
    .select('*')
    .eq('id', id)
    .eq('memberId', auth.userId)
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
  const current = found as Record<string, unknown>;

  if (req.method === 'DELETE') {
    if (current.status !== 'PENDING') {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'Only pending payout accounts can be deleted. Contact support for other statuses.',
        422,
      );
      res.status(status).json({ error });
      return;
    }
    if (current.isPrimary) {
      const { error, status } = toErrorEnvelope(
        'VALIDATION_ERROR',
        'Cannot delete the primary payout account.',
        422,
      );
      res.status(status).json({ error });
      return;
    }
    const { error } = await supabase.from('PayoutAccount').delete().eq('id', id);
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    res.status(200).json({ deleted: true });
    return;
  }

  if (current.status !== 'CONFIRMED') {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Only confirmed payout accounts can be set as primary.',
      422,
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
  const parsed = setPrimaryPayoutAccountRequestSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Invalid request.', 400);
    res.status(status).json({ error });
    return;
  }
  const { error: clearError } = await supabase
    .from('PayoutAccount')
    .update({ isPrimary: false })
    .eq('memberId', auth.userId);
  if (clearError) {
    const { error, status } = toErrorEnvelope('INTERNAL', clearError.message, 500);
    res.status(status).json({ error });
    return;
  }
  const { data: updated, error: updateError } = await supabase
    .from('PayoutAccount')
    .update({ isPrimary: true })
    .eq('id', id)
    .select('*')
    .single();
  if (updateError || !updated) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      updateError?.message ?? 'Update failed',
      500,
    );
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(mapPayoutAccountRow(updated as Record<string, unknown>));
}
