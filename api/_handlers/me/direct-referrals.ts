import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { childrenOf } from '../../_lib/referrals.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';

import { displayName, joinedAt, loadNetwork } from './_network.js';

/** GET /me/direct-referrals — single-level list. */
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
  const rows = await loadNetwork(supabase);
  okList(
    res,
    childrenOf(rows, auth.userId).map((row) => ({
      id: row.id,
      name: displayName(row),
      status: row.status ?? 'PENDING',
      isQualified: row.isQualified ?? false,
      joinedAt: joinedAt(row),
    })),
  );
}
