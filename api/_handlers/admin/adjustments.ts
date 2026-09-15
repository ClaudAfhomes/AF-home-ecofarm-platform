import { SUPER_ADMIN_ONLY } from '../../_lib/access.js';
import { verifyStaff } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidAdjustmentRow, mapAdjustmentRow } from '../../_lib/pipeline.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/**
 * GET /admin/adjustments — staff-authored financial adjustments, newest first
 * (super_admin ONLY). Non-SUP callers get 403; the admin UI falls back to mock
 * data for those roles so the Audit page keeps working for everyone.
 */
export async function listAdjustments(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaff(req, [...SUPER_ADMIN_ONLY]);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Adjustment')
    .select('*')
    .order('createdAt', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapAdjustmentRow);
  okList(res, rows.filter(isValidAdjustmentRow));
}

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
  return listAdjustments(req, res);
}
