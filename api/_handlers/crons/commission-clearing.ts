import { commissionClearBatchSchema } from '@jad/contracts';

import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/**
 * GET /crons/commission-clearing - daily scheduled trigger for the
 * commission clearing batch (Vercel Cron sends GET). Moves every due PENDING
 * commission to AVAILABLE with ledger + wallet movement via the atomic
 * `commission_clear_batch` function (system actor).
 *
 * Intentionally unauthenticated: the operation is idempotent and time-gated
 * (only PENDING rows at/older than COMMISSION_CLEARING_DAYS move), so an
 * unsolicited hit can create no money and advance no early state - it only
 * performs transitions the system already owes. Registered as a daily cron
 * in vercel.json (Hobby allows 2 daily crons; this is the second).
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
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase.rpc('commission_clear_batch', {
    p_window_days: null,
    p_actor: null,
    p_role: 'system',
  });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const parsed = commissionClearBatchSchema.safeParse(data ?? {});
  if (!parsed.success) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Clearing batch failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsed.data);
}
