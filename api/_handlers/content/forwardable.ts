import { toErrorEnvelope } from '../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidContentItemRow, mapContentItemRow } from '../../_lib/mappers.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';

/** GET /content/forwardable — published library (API-SPECIFICATION #68). */
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
    .from('ContentItem')
    .select('id, title, description, kind, download_url, share, created_at')
    .eq('published', true)
    .order('created_at', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapContentItemRow);
  okList(res, rows.filter(isValidContentItemRow));
}
