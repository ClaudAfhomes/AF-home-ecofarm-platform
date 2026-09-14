import { markMessagesReadResponseSchema } from '@jad/contracts';

import { verifyUser } from '../../../_lib/auth.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';

/**
 * POST /me/messages/read — mark own thread read (API-SPECIFICATION #92).
 * Upserts the Conversation watermark (memberLastReadAt=now, memberUnread=0);
 * idempotent, works before any message exists.
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
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('Conversation')
    .upsert(
      { memberId: auth.userId, memberLastReadAt: now, memberUnread: 0, updatedAt: now },
      { onConflict: '"memberId"' },
    )
    .select('memberId')
    .maybeSingle();
  if (error || !data) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      error?.message ?? 'Read watermark failed.',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  const parsed = markMessagesReadResponseSchema.safeParse({ readAt: now });
  if (!parsed.success) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', 'Read failed validation', 500);
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsed.data);
}
