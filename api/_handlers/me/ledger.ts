import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import {
  LEDGER_TYPE_ALLOWLIST,
  isValidLedgerRow,
  mapLedgerRow,
  withRunningBalance,
} from '../../_lib/money.js';
import { methodNotAllowed, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

/**
 * GET /me/ledger — own append-only ledger, cursor-paginated (id asc).
 * `?type=` allowlisted; `?limit=` clamped 1..100 (default 50). Running
 * Available Balance is computed server-side over the FULL ledger first, then
 * filtered, then paginated (mirrors the member mock; SCR-MEM-009).
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
  const query = req.query as Record<string, string | string[] | undefined>;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const cursor = first(query.cursor);
  const typeFilter = first(query.type);
  if (typeFilter && !(LEDGER_TYPE_ALLOWLIST as readonly string[]).includes(typeFilter)) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Unknown ledger entry type filter.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const requestedLimit = Number(first(query.limit) ?? 50);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 50;

  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('LedgerEntry')
    .select('*')
    .eq('memberId', auth.userId)
    .order('id', { ascending: true });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const rows = ((data as unknown[]) ?? []) as Record<string, unknown>[];
  const withBalance = withRunningBalance(rows).filter(isValidLedgerRow);
  const filtered = typeFilter
    ? withBalance.filter((row) => row.entryType === typeFilter)
    : withBalance;
  const startIndex = cursor ? filtered.findIndex((row) => row.id === cursor) + 1 : 0;
  const page = filtered.slice(startIndex, startIndex + limit).map(mapLedgerRow);
  const hasMore = startIndex + limit < filtered.length;
  res.status(200).json({
    data: page,
    meta: { pagination: hasMore ? { nextCursor: page[page.length - 1]?.id } : {} },
  });
}
