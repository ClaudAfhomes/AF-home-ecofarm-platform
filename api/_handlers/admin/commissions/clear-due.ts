import { commissionClearBatchSchema } from '@jad/contracts';

import { FINANCE_VIEW } from '../../../_lib/access.js';
import { verifyStaffModule } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/**
 * POST /admin/commissions/clear-due — run the commission clearing batch
 * on demand (staff, audited). Moves every due PENDING commission (createdAt
 * at/older than COMMISSION_CLEARING_DAYS) to AVAILABLE with ledger + wallet
 * movement, via the atomic `commission_clear_batch` function. The daily
 * `/crons/commission-clearing` cron automates this; this endpoint is the
 * manual override (e.g. after a config change or incident recovery).
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
  const auth = await verifyStaffModule(req, 'withdrawals', FINANCE_VIEW);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase.rpc('commission_clear_batch', {
    p_window_days: null,
    p_actor: auth.userId,
    p_role: auth.slugs[0] ?? 'admin',
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
