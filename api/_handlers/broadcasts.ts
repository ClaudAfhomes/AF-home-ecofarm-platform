import { createBroadcastRequestSchema, notificationSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../_lib/access.js';
import { verifyStaffModule } from '../_lib/auth.js';
import { appendAudit } from '../_lib/audit.js';
import { toErrorEnvelope } from '../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../_lib/http.js';
import { mapNotificationRow } from '../_lib/mappers.js';
import { prefixedId } from '../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../_lib/rest.js';

/**
 * POST /broadcasts - admin announcement to all members (API-SPECIFICATION #72,
 * FEAT-063, FR-ADM-005). A broadcast is a Notification row with member_id NULL;
 * the member feed (`GET /me/broadcasts`) serves it to every member. Per-member
 * read state lives in NotificationRead, so the broadcast row itself carries no
 * read_at. Audited BROADCAST_CREATED.
 */
async function createBroadcast(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'marketing_tools', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = createBroadcastRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Enter an announcement title.',
      400,
      parsed.error.issues,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const row = {
    id: prefixedId('ntf'),
    member_id: null,
    title: parsed.data.title,
    body: parsed.data.body?.trim() ? parsed.data.body.trim() : null,
    read_at: null,
  };
  const { data, error } = await supabase.from('Notification').insert(row).select().single();
  if (error || !data) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      error?.message ?? 'Failed to save broadcast',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  const mapped = mapNotificationRow(data as Record<string, unknown>);
  const validated = notificationSchema.safeParse(mapped);
  if (!validated.success) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Stored broadcast record failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  await appendAudit(supabase, {
    action: 'BROADCAST_CREATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'admin',
    targetType: 'Notification',
    targetId: validated.data.id,
    targetName: validated.data.title,
    detail: `Broadcast ${validated.data.title}`,
  });
  res.status(201).json(validated.data);
}

/** POST /broadcasts - admin create only (the member read path is GET /me/broadcasts). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'POST') return createBroadcast(req, res);
  methodNotAllowed(res, req.method);
}
