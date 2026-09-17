import { saleSchema } from '@jad/contracts';

import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { mapSaleRow } from '../../_lib/pipeline.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/**
 * GET /sales/:id - seller or selected referrer only (404 otherwise, hides
 * existence). Referrer access is read-only: a DIRECT_REFERRAL commission
 * points at the seller's sale, so the referrer must be able to open the link
 * from the commissions list. All mutations stay seller-scoped.
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
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Not found', 404);
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Sale')
    .select('*')
    .eq('id', id)
    .or(`sellerId.eq.${auth.userId},referrerId.eq.${auth.userId}`)
    .maybeSingle();
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  if (!data) {
    const { error: env, status } = toErrorEnvelope('NOT_FOUND', 'Not found', 404);
    res.status(status).json({ error: env });
    return;
  }
  // Configured rates for the estimate preview (never hard-code 8%/4%).
  // Served here (own sale only) so rates stay off the public surface.
  const { data: rateRows } = await supabase
    .from('SystemConfig')
    .select('key,value')
    .in('key', ['COMMISSION_DIRECT_RATE', 'COMMISSION_REFERRAL_RATE']);
  const rateByKey: Record<string, string> = {};
  for (const r of (rateRows as { key: string; value: string }[] | null) ?? []) {
    rateByKey[r.key] = r.value;
  }
  const parsed = saleSchema.safeParse({
    ...mapSaleRow(data as Record<string, unknown>),
    ...(rateByKey.COMMISSION_DIRECT_RATE && rateByKey.COMMISSION_REFERRAL_RATE
      ? {
          commissionRates: {
            direct: rateByKey.COMMISSION_DIRECT_RATE,
            referral: rateByKey.COMMISSION_REFERRAL_RATE,
          },
        }
      : {}),
  });
  if (!parsed.success) {
    const { error: env, status } = toErrorEnvelope(
      'INTERNAL',
      'Stored sale failed validation',
      500,
    );
    res.status(status).json({ error: env });
    return;
  }
  res.status(200).json(parsed.data);
}
