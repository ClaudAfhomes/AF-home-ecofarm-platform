import { createMessageRequestSchema, messageSchema } from '@jad/contracts';

import { verifyUser } from '../../_lib/auth.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidMessageRow, mapMessageRow, paginateByCursor } from '../../_lib/messaging.js';
import { prefixedId } from '../../_lib/pipeline.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../_lib/rest.js';

/**
 * GET /me/messages — own thread, cursor-paginated (newest first).
 * `?cursor=` last seen message id, `?limit=` clamped 1..100 (default 50).
 * POST /me/messages — send a message to the admin team (API-SPECIFICATION
 * #90/#91, FEAT-072). The `message_after_insert` trigger maintains the
 * Conversation row atomically with the insert.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
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

  if (req.method === 'GET') {
    const query = req.query as Record<string, string | string[] | undefined>;
    const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    const cursor = first(query.cursor);
    const requestedLimit = Number(first(query.limit) ?? 50);
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), 100)
        : 50;
    const { data, error } = await supabase
      .from('Message')
      .select('id,senderType,senderName,body,createdAt')
      .eq('memberId', auth.userId)
      .order('createdAt', { ascending: false })
      .order('id', { ascending: false });
    if (error) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
      res.status(status).json({ error: env });
      return;
    }
    const rows = ((((data as unknown[]) ?? []) as Record<string, unknown>[]).map(
      mapMessageRow,
    ).filter(isValidMessageRow) as { id: string }[]);
    const { page, nextCursor } = paginateByCursor(rows, cursor, limit);
    res.status(200).json({
      data: page,
      meta: { pagination: nextCursor ? { nextCursor } : {} },
    });
    return;
  }

  if (req.method === 'POST') {
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
    // Display snapshot: member name (falls back to email, never invented).
    const { data: member } = await supabase
      .from('Member')
      .select('name,email')
      .eq('id', auth.userId)
      .maybeSingle();
    const senderName =
      (member as { name?: unknown; email?: unknown } | null)?.name ||
      (member as { name?: unknown; email?: unknown } | null)?.email ||
      'Member';
    const { data, error } = await supabase
      .from('Message')
      .insert({
        id: prefixedId('msg'),
        memberId: auth.userId,
        senderType: 'MEMBER',
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
    const parsed = messageSchema.safeParse(mapMessageRow(data as Record<string, unknown>));
    if (!parsed.success) {
      const { error: env, status } = toErrorEnvelope('INTERNAL', 'Message failed validation', 500);
      res.status(status).json({ error: env });
      return;
    }
    res.status(201).json(parsed.data);
    return;
  }

  methodNotAllowed(res, req.method);
}
