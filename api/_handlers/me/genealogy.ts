import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { genealogyTree } from '../../_lib/referrals.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

import { displayName, joinedAt, loadNetwork } from './_network.js';

/** GET /me/genealogy — referral tree visualization. */
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
  if (!rows.some((row) => row.id === auth.userId)) {
    const { error, status } = toErrorEnvelope('NOT_FOUND', 'Member not found', 404);
    res.status(status).json({ error });
    return;
  }
  const root = genealogyTree(
    rows.map((row) => ({
      id: row.id,
      sponsorId: row.sponsorId ?? undefined,
      name: displayName(row),
      status: row.status ?? 'PENDING',
      isQualified: row.isQualified ?? false,
      joinedAt: joinedAt(row),
    })),
    auth.userId,
  );
  if (!root) {
    const { error, status } = toErrorEnvelope('INTERNAL', 'Genealogy build failed', 500);
    res.status(status).json({ error });
    return;
  }
  res.status(200).json({ root });
}
