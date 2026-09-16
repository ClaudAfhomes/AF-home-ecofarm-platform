import { contactInquirySchema, contactInquiryUpdateSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import { appendAudit } from '../../../_lib/audit.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';

/** PATCH /admin/inquiries/:id - triage a contact submission, audited. */
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
  const auth = await verifyStaffModule(req, 'cms', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Inquiry id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = contactInquiryUpdateSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Status must be NEW, READ, or ARCHIVED.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: current, error: readError } = await supabase
    .from('ContactInquiry')
    .select('id, name, email, message, status, createdAt, handledAt, handledBy')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    const { error, status } = toErrorEnvelope('INTERNAL', readError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!current) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', `Inquiry not found: ${id}`, 404);
    res.status(status).json({ error });
    return;
  }
  const prev = current as Record<string, unknown>;
  const now = new Date().toISOString();
  const { data: updated, error: writeError } = await supabase
    .from('ContactInquiry')
    .update({ status: parsed.data.status, handledAt: now, handledBy: auth.userId })
    .eq('id', id)
    .select('id, name, email, message, status, createdAt, handledAt, handledBy')
    .maybeSingle();
  if (writeError || !updated) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      writeError?.message ?? 'Failed to update inquiry',
      500,
    );
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'INQUIRY_STATUS_UPDATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'ContactInquiry',
    targetId: id,
    targetName: String(prev.name ?? id),
    detail: `Updated status from ${String(prev.status)} to ${parsed.data.status}`,
  });
  const validated = contactInquirySchema.safeParse({
    ...(updated as Record<string, unknown>),
    handledAt: (updated as Record<string, unknown>).handledAt ?? null,
    handledBy: (updated as Record<string, unknown>).handledBy ?? null,
  });
  if (!validated.success) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      'Stored inquiry record failed validation',
      500,
    );
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(validated.data);
}
