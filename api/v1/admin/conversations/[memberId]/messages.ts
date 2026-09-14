import { createMessageRequestSchema, messageSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../../../_lib/access.js';
import { verifyStaffModule } from '../../../../_lib/auth.js';
import { appendAudit } from '../../../../_lib/audit.js';
import { toErrorEnvelope } from '../../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../../_lib/http.js';
import { mapMessageRow } from '../../../../_lib/messaging.js';
import { prefixedId } from '../../../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../../_lib/rest.js';

/**
 * POST /admin/conversations/:memberId/messages — staff reply in a member's
 * thread (API-SPECIFICATION #92). 404s unknown members. Audited
 * (MESSAGE_SENT, NFR-SEC-002); audit failure never breaks the reply itself.
 */
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
  const auth = await verifyStaffModule(req, 'messages', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const memberId = Array.isArray(req.query.memberId) ? req.query.memberId[0] : req.query.memberId;
  if (!memberId) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Member id is required.', 400);
    res.status(status).json({ error });
    return;
  }
  const bodyResult = readJsonBody(req);
  if (!bodyResult.ok) {
    const { error, status } = bodyResult.error;
    res.status(status).json({ error });
    return;
  }
  const parsedBody = createMessageRequestSchema.safeParse(bodyResult.body);
  if (!parsedBody.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      parsedBody.error.issues[0]?.message ?? 'Invalid message.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  // Existence gate: never open a thread for an unknown member.
  const { data: member, error: memberError } = await supabase
    .from('Member')
    .select('id')
    .eq('id', memberId)
    .maybeSingle();
  if (memberError) {
    const { error, status } = toErrorEnvelope('INTERNAL', memberError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!member) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Member not found.', 404);
    res.status(status).json({ error });
    return;
  }
  // Display snapshot: replier's staff name (falls back to role slug).
  const { data: staff } = await supabase.from('StaffUser').select('name').eq('id', auth.userId).maybeSingle();
  const senderName =
    (staff as { name?: unknown } | null)?.name || auth.slugs[0] || 'JAD Support';
  const { data, error } = await supabase
    .from('Message')
    .insert({
      id: prefixedId('msg'),
      memberId,
      senderType: 'STAFF',
      senderId: auth.userId,
      senderName: String(senderName),
      body: parsedBody.data.body,
    })
    .select('id,senderType,senderName,body,createdAt')
    .single();
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  await appendAudit(supabase, {
    action: 'MESSAGE_SENT',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Conversation',
    targetId: memberId,
    detail: 'Staff reply in member thread.',
  });
  const parsed = messageSchema.safeParse(mapMessageRow(data as Record<string, unknown>));
  if (!parsed.success) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', 'Message failed validation', 500);
    res.status(status).json({ error: env });
    return;
  }
  res.status(201).json(parsed.data);
}
