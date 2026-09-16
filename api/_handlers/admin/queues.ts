import { adminQueuesSchema } from '@jad/contracts';

import { ADMIN_STAFF } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/**
 * GET /admin/queues - dashboard queue counts (super_admin, admin).
 * Server facts, never derived client-side.
 */
export async function getQueues(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'dashboard', ADMIN_STAFF);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const [registrations, sales, members, withdrawals] = await Promise.all([
    supabase
      .from('Registration')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDING'),
    supabase.from('Sale').select('id', { count: 'exact', head: true }),
    supabase.from('Member').select('id', { count: 'exact', head: true }).is('archivedAt', null),
    supabase.from('Withdrawal').select('id', { count: 'exact', head: true }),
  ]);
  for (const [label, result] of [
    ['Registration', registrations],
    ['Sale', sales],
    ['Member', members],
    ['Withdrawal', withdrawals],
  ] as const) {
    if (result.error) {
      const { error, status } = toErrorEnvelope(
        'INTERNAL',
        `${label} count failed: ${result.error.message}`,
        500,
      );
      res.status(status).json({ error });
      return;
    }
  }
  const parsed = adminQueuesSchema.safeParse({
    registrations: registrations.count ?? 0,
    sales: sales.count ?? 0,
    members: members.count ?? 0,
    withdrawals: withdrawals.count ?? 0,
  });
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Queue counts failed validation', 500);
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(parsed.data);
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
  return getQueues(req, res);
}
