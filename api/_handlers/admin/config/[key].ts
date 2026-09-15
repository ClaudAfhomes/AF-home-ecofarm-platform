import { verifyStaff } from '../../../_lib/auth.js';
import { appendAudit } from '../../../_lib/audit.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, readJsonBody, requireService } from '../../../_lib/rest.js';

/** PATCH /admin/config/:key — super_admin-only parameter update, audited. */
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
  const auth = await verifyStaff(req, ['super_admin']);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawKey = req.query.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Config key is required', 400);
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const value = (parsedBody.body as Record<string, unknown> | null)?.value;
  if (typeof value !== 'string' || value.length === 0) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'A non-empty string value is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data: current, error: readError } = await supabase
    .from('SystemConfig')
    .select('key, label, value, category')
    .eq('key', key)
    .maybeSingle();
  if (readError) {
    const { error, status } = toErrorEnvelope('INTERNAL', readError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!current) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', `Config key not found: ${key}`, 404);
    res.status(status).json({ error });
    return;
  }
  const prev = current as { key: string; label: string; value: string; category: string };
  const { error: writeError } = await supabase
    .from('SystemConfig')
    .update({ value, updated_by: auth.userId, updated_at: new Date().toISOString() })
    .eq('key', key);
  if (writeError) {
    const { error, status } = toErrorEnvelope('INTERNAL', writeError.message, 500);
    res.status(status).json({ error });
    return;
  }
  await appendAudit(supabase, {
    action: 'CONFIG_UPDATED',
    actorId: auth.userId,
    actorRole: auth.slugs[0] ?? 'super_admin',
    targetType: 'SystemConfig',
    targetId: prev.key,
    targetName: prev.label,
    detail: `Updated value from ${prev.value} to ${value}`,
  });
  res.status(200).json({ ...prev, value });
}
