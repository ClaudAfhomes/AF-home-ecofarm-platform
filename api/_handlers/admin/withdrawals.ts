import { FINANCE_VIEW } from '../../_lib/access.js';
import { verifyStaffModule } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import {
  fetchWithdrawalIdentifierMap,
  injectWithdrawalIdentifiers,
  isValidWithdrawalRow,
  mapWithdrawalRow,
} from '../../_lib/money.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET /admin/withdrawals - staff queue, newest first (super_admin, admin, finance). */
export async function listAdminWithdrawals(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyStaffModule(req, 'withdrawals', FINANCE_VIEW);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Withdrawal')
    .select('*')
    .order('createdAt', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const stored = ((data as unknown[]) ?? []) as Record<string, unknown>[];
  const rawMap = await fetchWithdrawalIdentifierMap(
    supabase,
    stored.map((row) => (typeof row.payoutAccountId === 'string' ? row.payoutAccountId : '')),
  );
  const rows = injectWithdrawalIdentifiers(stored, rawMap).map(mapWithdrawalRow);
  okList(res, rows.filter(isValidWithdrawalRow));
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
  return listAdminWithdrawals(req, res);
}
