import { ADMIN_STAFF } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidRegistrationRow, mapRegistrationRow } from '../../_lib/pipeline.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET /admin/registrations — application queue, newest first. */
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
  const auth = await verifyStaffModule(req, 'registrations', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Registration')
    .select('*')
    .order('submittedAt', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapRegistrationRow);
  okList(res, rows.filter(isValidRegistrationRow));
}
