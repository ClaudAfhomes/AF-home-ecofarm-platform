import { registrationSchema, rejectionNoteSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../../_lib/access.js';
import { verifyStaffModule } from '../../../../_lib/auth.js';
import { appendAudit } from '../../../../_lib/audit.js';
import type { VercelRequest, VercelResponse } from '../../../../_lib/http.js';
import { mapRegistrationRow } from '../../../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../../_lib/envelope.js';

/** POST /admin/registrations/:id/reject - reject with mandatory reason (BR-REG-004). */
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
  const auth = await verifyStaffModule(req, 'registrations', ADMIN_STAFF);
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
      'Registration id is required',
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
  const parsed = rejectionNoteSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Rejection note requires reason and requiredChanges (BR-REG-004).',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: reg, error: readError } = await supabase
    .from('Registration')
    .select('id, status, firstName, lastName')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    const { error, status } = toErrorEnvelope('INTERNAL', readError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!reg) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Registration not found', 404);
    res.status(status).json({ error });
    return;
  }
  const row = reg as { id: string; status: string; firstName: string; lastName: string };
  if (row.status !== 'PENDING') {
    const { error, status } = toErrorEnvelope(
      'CONFLICT',
      'Only PENDING registrations can be rejected.',
      409,
    );
    res.status(status).json({ error });
    return;
  }
  const now = new Date().toISOString();
  const { error: writeError } = await supabase
    .from('Registration')
    .update({
      status: 'REJECTED',
      rejectionNote: {
        reason: parsed.data.reason.trim(),
        requiredChanges: parsed.data.requiredChanges.trim(),
      },
      reviewedAt: now,
      reviewedBy: auth.userId,
      updatedAt: now,
    })
    .eq('id', id);
  if (writeError) {
    const { error, status } = toErrorEnvelope('INTERNAL', writeError.message, 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'REGISTRATION_REJECTED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Registration',
    targetId: id,
    targetName: `${row.firstName} ${row.lastName}`,
    detail: parsed.data.reason.trim(),
  });
  // Return the full updated row - the client validates reject responses
  // against registrationSchema, so a partial shape would fail parsing
  // AFTER a successful reject.
  const { data: updated, error: readBackError } = await supabase
    .from('Registration')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readBackError || !updated) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      readBackError?.message ?? 'Rejected registration unreadable',
      500,
    );
    res.status(status).json({ error });
    return;
  }
  const validated = registrationSchema.safeParse(
    mapRegistrationRow(updated as Record<string, unknown>),
  );
  if (!validated.success) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      'Rejected registration failed validation',
      500,
    );
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(validated.data);
}
