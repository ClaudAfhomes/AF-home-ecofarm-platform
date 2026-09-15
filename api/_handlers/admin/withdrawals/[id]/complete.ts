import { FINANCE_VIEW } from '../../../../_lib/access.js';
import { verifyStaffModule } from '../../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../../_lib/http.js';
import {
  fetchWithdrawalIdentifierMap,
  injectWithdrawalIdentifiers,
  isValidWithdrawalRow,
  mapWithdrawalRow,
} from '../../../../_lib/money.js';
import { methodNotAllowed, requireService } from '../../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../../_lib/envelope.js';

/**
 * POST /admin/withdrawals/:id/complete — atomic staff completion via the DB
 * function (single transaction: status, ledger WITHDRAWAL_COMPLETION, wallet
 * pending→withdrawn, audit). The function returns {status,...} or
 * {error:{code,message,status}}.
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
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('VALIDATION_ERROR', 'Withdrawal id is required', 400);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase.rpc('withdrawal_complete', {
    p_id: id,
    p_actor: auth.userId,
    p_role: auth.slugs[0] ?? 'admin',
  });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const result = (data ?? {}) as { error?: { code: string; message: string; status?: number } };
  if (result.error) {
    const { error: env, status } = toErrorEnvelope(
      result.error.code as never,
      result.error.message,
      result.error.status ?? 500,
    );
    res.status(status).json({ error: env });
    return;
  }
  const { data: updated, error: readError } = await supabase
    .from('Withdrawal')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError || !updated) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      readError?.message ?? 'Withdrawal unreadable',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  const stored = updated as Record<string, unknown>;
  const rawMap = await fetchWithdrawalIdentifierMap(supabase, [
    typeof stored.payoutAccountId === 'string' ? stored.payoutAccountId : '',
  ]);
  const mapped = mapWithdrawalRow(injectWithdrawalIdentifiers([stored], rawMap)[0]!);
  if (!isValidWithdrawalRow(updated as Record<string, unknown>)) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Stored withdrawal failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(mapped);
}
