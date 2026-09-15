import { programSchema } from '@jad/contracts';

import { toErrorEnvelope } from '../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../_lib/http.js';
import { methodNotAllowed, okList, requireService } from '../_lib/rest.js';

/** GET /programs — public program list (API-SPECIFICATION #78). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res, req.method);
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Program')
    .select('id, code, name, description')
    .order('id');
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = ((data as unknown[]) ?? []).filter((row) => programSchema.safeParse(row).success);
  okList(res, rows);
}
