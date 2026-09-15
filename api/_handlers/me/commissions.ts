import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import { isValidCommissionRow, mapCommissionRow } from '../../_lib/money.js';
import { methodNotAllowed, okList, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/** GET /me/commissions — own commissions incl. status, newest first. */
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
    .from('Commission')
    .select('*')
    .eq('memberId', auth.userId)
    .order('createdAt', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = ((data as unknown[]) ?? []) as Record<string, unknown>[];
  const saleIds = [
    ...new Set(rows.map((r) => r.saleId).filter((id): id is string => typeof id === 'string')),
  ];
  const names = new Map<string, string>();
  if (saleIds.length > 0) {
    const { data: sales } = await supabase.from('Sale').select('id,propertyName').in('id', saleIds);
    for (const s of (sales as { id: string; propertyName: string | null }[] | null) ?? []) {
      names.set(s.id, s.propertyName || s.id);
    }
  }
  const mapped = rows.map((row) =>
    mapCommissionRow(row, typeof row.saleId === 'string' ? names.get(row.saleId) : undefined),
  );
  okList(
    res,
    mapped.filter((row) => isValidCommissionRow(row)),
  );
}
