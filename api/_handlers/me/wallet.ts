import { walletSchema } from '@jad/contracts';

import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidWalletRow, zeroWallet } from '../../_lib/money.js';
import { sumPendingCommission } from '../../_lib/pending-commission.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET /me/wallet - own eWallet summary, server-authoritative (never negative, BI-001). */
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
  // Pending commission estimate: own open sales x direct rate + referred sales x referral rate.
  let pendingCommission = '0.00';
  try {
    const [rateRows, ownSales, referredSales] = await Promise.all([
      supabase
        .from('SystemConfig')
        .select('key,value')
        .in('key', ['COMMISSION_DIRECT_RATE', 'COMMISSION_REFERRAL_RATE']),
      supabase.from('Sale').select('propertyValue,status').eq('sellerId', auth.userId),
      supabase.from('Sale').select('propertyValue,status').eq('referrerId', auth.userId),
    ]);
    const rateByKey: Record<string, string> = {};
    for (const r of ((rateRows as { data?: { key: string; value: string }[] | null })?.data ??
      []) as { key: string; value: string }[]) {
      rateByKey[r.key] = r.value;
    }
    const ownRows = ((ownSales as { data?: unknown[] | null })?.data ?? []) as {
      status: unknown;
      propertyValue: unknown;
    }[];
    const referredRows = ((referredSales as { data?: unknown[] | null })?.data ?? []) as {
      status: unknown;
      propertyValue: unknown;
    }[];
    pendingCommission = sumPendingCommission({
      ownSales: ownRows,
      referredSales: referredRows,
      directRate: rateByKey.COMMISSION_DIRECT_RATE,
      referralRate: rateByKey.COMMISSION_REFERRAL_RATE,
    });
  } catch {
    pendingCommission = '0.00';
  }

  const withPending = { ...(data ?? zeroWallet()), pendingCommission };
  // Attach pendingCommission after stored-row validation; walletSchema allows it optional.
  const rawWallet = data ?? zeroWallet();
  const parsed = walletSchema.safeParse(withPending);
  if (!parsed.success || !isValidWalletRow(rawWallet as Record<string, unknown>)) {
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
