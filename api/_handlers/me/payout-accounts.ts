import { createPayoutAccountRequestSchema } from '@jad/contracts';

import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidPayoutAccountRow, mapPayoutAccountRow, prefixedId } from '../../_lib/pipeline.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET own payout accounts / POST create (PENDING, never primary). */
export async function listPayoutAccounts(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('PayoutAccount')
    .select('*')
    .eq('memberId', auth.userId)
    .order('createdAt', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = (((data as unknown[]) ?? []) as Record<string, unknown>[]).map(mapPayoutAccountRow);
  okList(res, rows.filter(isValidPayoutAccountRow));
}

export async function createPayoutAccount(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = createPayoutAccountRequestSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Enter the payout method, account name, and account identifier.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const account = {
    id: prefixedId('pa'),
    memberId: auth.userId,
    method: parsed.data.method,
    accountName: parsed.data.accountName,
    accountIdentifier: parsed.data.accountIdentifier,
    status: 'PENDING',
    isPrimary: false,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from('PayoutAccount').insert(account);
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  res.status(201).json(mapPayoutAccountRow(account as Record<string, unknown>));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') return listPayoutAccounts(req, res);
  if (req.method === 'POST') return createPayoutAccount(req, res);
  methodNotAllowed(res, req.method);
}
