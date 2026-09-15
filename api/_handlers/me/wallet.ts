import { walletSchema } from '@jad/contracts';

import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidWalletRow, zeroWallet } from '../../_lib/money.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET /me/wallet — own eWallet summary, server-authoritative (never negative, BI-001). */
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
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Wallet')
    .select('availableBalance,pendingAmount,totalWithdrawals,totalEarned')
    .eq('memberId', auth.userId)
    .maybeSingle();
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const wallet = data ?? zeroWallet();
  const parsed = walletSchema.safeParse(wallet);
  if (!parsed.success || !isValidWalletRow(wallet as Record<string, unknown>)) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Stored wallet failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsed.data);
}
