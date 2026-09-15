import { submitSaleRequestSchema } from '@jad/contracts';

import { verifyUser } from '../../../_lib/auth.js';
import { appendAudit } from '../../../_lib/audit.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { applyResubmit, findCatalogPrice, mapSaleRow } from '../../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/** POST /sales/:id/resubmit — REJECTED-only, counts up, locks at max (BR-SAL-006). */
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
  const { data: member } = await supabase
    .from('Member')
    .select('isQualified, accountStatus')
    .eq('id', auth.userId)
    .maybeSingle();
  const memberGate = member as { isQualified?: boolean; accountStatus?: string } | null;
  if (memberGate?.isQualified !== true || memberGate.accountStatus !== 'ACTIVE') {
    const { error, status } = toErrorEnvelope(
      'MEMBER_NOT_QUALIFIED',
      'Only Active + Qualified members can submit sales.',
      422,
    );
    res.status(status).json({ error });
    return;
  }
  const { data: found, error: readError } = await supabase
    .from('Sale')
    .select('*')
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
  const current = found as Record<string, unknown>;
  const { data: configRows } = await supabase
    .from('SystemConfig')
    .select('value')
    .eq('key', 'MAX_RESUBMISSION_ATTEMPTS')
    .maybeSingle();
  const maxAttempts = Number.parseInt((configRows as { value?: string } | null)?.value ?? '3', 10);
  const outcome = applyResubmit(
    String(current.status),
    Number(current.resubmissionCount ?? 0),
    Number.isFinite(maxAttempts) ? maxAttempts : 3,
  );
  if ('error' in outcome) {
    const locked = outcome.error.includes('locked');
    const { error, status } = toErrorEnvelope(
      locked ? 'SALE_LOCKED' : 'CONFLICT',
      outcome.error,
      409,
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
  const parsed = submitSaleRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Select a customer and a property from the catalog.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const { data: customer } = await supabase
    .from('Customer')
    .select('id, name')
    .eq('id', parsed.data.customerId)
    .eq('memberId', auth.userId)
    .maybeSingle();
  if (!customer) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Customer not found.', 404);
    res.status(status).json({ error });
    return;
  }
  const { data: cmsRow } = await supabase
    .from('cms_contents')
    .select('content')
    .eq('key', 'properties')
    .maybeSingle();
  const property = findCatalogPrice(
    (cmsRow as { content?: unknown } | null)?.content ?? null,
    parsed.data.propertyId,
  );
  if (!property) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'This property is not available in the catalog.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    customerId: parsed.data.customerId,
    customerName: (customer as { name: string }).name,
    propertyId: parsed.data.propertyId,
    propertyName: property.name,
    propertyValue: property.price,
    resubmissionCount: outcome.resubmissionCount,
    status: outcome.status,
    rejectionReason: null,
    submittedAt: now,
    updatedAt: now,
    ...(parsed.data.referrerName !== undefined ? { referrerName: parsed.data.referrerName } : {}),
  };
  if (outcome.status === 'LOCKED') patch.lockedAt = now;
  const { data: updated, error: writeError } = await supabase
    .from('Sale')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (writeError || !updated) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      writeError?.message ?? 'Update failed',
      500,
    );
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: outcome.status === 'LOCKED' ? 'SALE_LOCKED' : 'SALE_RESUBMITTED',
    actorId: auth.userId,
    actorRole: 'user',
    targetType: 'Sale',
    targetId: id,
    targetName: `${property.name} — ${(customer as { name: string }).name}`,
    detail:
      outcome.status === 'LOCKED'
        ? 'Maximum resubmission attempts exceeded (BR-SAL-006)'
        : `Resubmitted sale ${id}`,
  });
  res.status(200).json(mapSaleRow(updated as Record<string, unknown>));
}
