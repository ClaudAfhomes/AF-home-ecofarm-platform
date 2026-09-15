import { verifyUser } from '../../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';
import { descendantsOf } from '../../../_lib/referrals.js';
import { methodNotAllowed, requireService } from '../../../_lib/rest.js';

import { loadNetwork } from '../_network.js';

/** GET /me/reports/group-network — downline summary (reporting only). */
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
  const downline = descendantsOf(await loadNetwork(supabase), auth.userId);
  res.status(200).json({
    totalMembers: downline.length,
    directReferrals: downline.filter((row) => row.sponsorId === auth.userId).length,
    qualified: downline.filter((row) => (row as { isQualified?: boolean }).isQualified === true)
      .length,
    pending: downline.filter((row) => (row as { status?: string }).status === 'PENDING').length,
    rejected: downline.filter((row) => (row as { status?: string }).status === 'REJECTED').length,
  });
}
