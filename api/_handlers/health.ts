import { setCors } from '../_lib/cors.js';
import { toErrorEnvelope } from '../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../_lib/http.js';
import { requireService } from '../_lib/rest.js';

/**
 * GET /health (+ /api/v1/health via the vercel.json rewrite) - liveness and a
 * lightweight DB readiness probe for operators. Never returns sensitive data.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, req, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    const { error, status } = toErrorEnvelope('NOT_FOUND', `Method ${req.method} not allowed`, 405);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return; // requireService already wrote a 500 (Supabase not configured)
  const { error } = await supabase.from('SystemConfig').select('key').limit(1);
  res.status(200).json({
    ok: true,
    service: 'jad-api',
    db: error ? 'error' : 'ok',
    time: new Date().toISOString(),
  });
}
