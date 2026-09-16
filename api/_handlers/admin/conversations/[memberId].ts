import { ADMIN_STAFF } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { isValidMessageRow, mapMessageRow, paginateByCursor } from '../../../_lib/messaging.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';

/**
 * GET /admin/conversations/:memberId — one member's thread for staff
 * (API-SPECIFICATION #91). Cursor-paginated (newest first). 404s when the
 * member has no thread and 404s unknown members (staff 404-hide convention).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
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
  const supabase = requireService(res);
  if (!supabase) return;
  // Existence gate: unknown members (or members with no thread) 404.
  const { data: conversation, error: conversationError } = await supabase
    .from('Conversation')
    .select('memberId')
    .eq('memberId', memberId)
    .maybeSingle();
  if (conversationError) {
    const { error, status } = toErrorEnvelope('INTERNAL', conversationError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!conversation) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Conversation not found.', 404);
    res.status(status).json({ error });
    return;
  }
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
    .eq('memberId', memberId)
    .order('createdAt', { ascending: false })
    .order('id', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[])
    .map(mapMessageRow)
    .filter(isValidMessageRow) as { id: string }[];
  const { page, nextCursor } = paginateByCursor(rows, cursor, limit);
  res.status(200).json({
    data: page,
    meta: { pagination: nextCursor ? { nextCursor } : {} },
  });
}
