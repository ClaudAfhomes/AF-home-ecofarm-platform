import { verifyUser } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import {
  fetchWithdrawalIdentifierMap,
  injectWithdrawalIdentifiers,
  isValidWithdrawalRow,
  mapWithdrawalRow,
} from '../../../_lib/money.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';
import { toErrorEnvelope } from '../../../_lib/envelope.js';

/** GET /me/withdrawals/:id — one of the member's own withdrawals. */
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
  const auth = await verifyUser(req);
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
  const { data: found, error: readError } = await supabase
    .from('Withdrawal')
    .select('*')
    .eq('id', id)
    .eq('memberId', auth.userId)
    .maybeSingle();
  if (readError) {
    const { error, status } = toErrorEnvelope('INTERNAL', readError.message, 500);
    res.status(status).json({ error });
    return;
  }
  if (!found) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Not found', 404);
    res.status(status).json({ error });
    return;
  }
  const stored = found as Record<string, unknown>;
  const rawMap = await fetchWithdrawalIdentifierMap(
    supabase,
    [typeof stored.payoutAccountId === 'string' ? stored.payoutAccountId : ''],
    auth.userId,
  );
  const mapped = mapWithdrawalRow(injectWithdrawalIdentifiers([stored], rawMap)[0]!);
  if (!isValidWithdrawalRow(found as Record<string, unknown>)) {
    const { error, status } = toErrorEnvelope(
      'INTERNAL',
      'Stored withdrawal failed validation',
      500,
    );
    res.status(status).json({ error });
    return;
  }
  res.status(200).json(mapped);
}
