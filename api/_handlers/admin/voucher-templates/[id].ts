import { voucherTemplateSchema } from '@jad/contracts';

import { ADMIN_STAFF, FINANCE_VIEW } from '../../../_lib/access.js';
import { appendAudit } from '../../../_lib/audit.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { mapVoucherTemplateRow } from '../../../_lib/pipeline.js';
import { validateUpdateTemplate } from '../../../_lib/cutover.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/**
 * GET /admin/voucher-templates/:id (super_admin, admin, finance).
 * PATCH / DELETE (super_admin, admin). DELETE cascades to assignments,
 * mirroring the admin mock repository.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'DELETE') {
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
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Template id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: found, error: readError } = await supabase
    .from('VoucherTemplate')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError || !found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Voucher template not found', 404);
    res.status(status).json({ error });
    return;
  }
  const current = found as Record<string, unknown>;

  if (req.method === 'GET') {
    const parsed = voucherTemplateSchema.safeParse(mapVoucherTemplateRow(current));
    if (!parsed.success) {
      const { error, status } = toErrorEnvelope(
        'INTERNAL',
        'Stored template failed validation',
        500,
      );
      res.status(status).json({ error });
      return;
    }
    res.status(200).json(parsed.data);
    return;
  }

  if (req.method === 'DELETE') {
    const { error: deleteAssignmentsError } = await supabase
      .from('Voucher')
      .delete()
      .eq('templateId', id);
    if (deleteAssignmentsError) {
      const { error, status } = toErrorEnvelope('INTERNAL', deleteAssignmentsError.message, 500);
      res.status(status).json({ error });
      return;
    }
    const { error } = await supabase.from('VoucherTemplate').delete().eq('id', id);
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    await appendAudit(supabase, {
      action: 'VOUCHER_TEMPLATE_DELETED',
      actorId: auth.userId,
      actorRole: auth.slugs[0] ?? 'admin',
      targetType: 'VoucherTemplate',
      targetId: id,
      targetName: String(current.title ?? id),
      detail: `Deleted voucher template ${String(current.title ?? id)} and its assignments`,
    });
    res.status(200).json({ id, deleted: true });
    return;
  }

  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = validateUpdateTemplate(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Invalid template update.', 400);
    res.status(status).json({ error });
    return;
  }
  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.expiresAt !== undefined) patch.expiresAt = parsed.data.expiresAt;
  if (parsed.data.validityDays !== undefined) patch.validityDays = parsed.data.validityDays;
  if (Object.keys(patch).length === 0) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Nothing to update.', 400);
    res.status(status).json({ error });
    return;
  }
  const { data: updated, error: updateError } = await supabase
    .from('VoucherTemplate')
    .update(patch)
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
  await appendAudit(supabase, {
    action: 'VOUCHER_TEMPLATE_UPDATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'VoucherTemplate',
    targetId: id,
    targetName: String((updated as Record<string, unknown>).title ?? id),
    detail: `Updated voucher template ${id}`,
  });
  const validated = voucherTemplateSchema.safeParse(
    mapVoucherTemplateRow(updated as Record<string, unknown>),
  );
  if (!validated.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Stored template failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(validated.data);
}
