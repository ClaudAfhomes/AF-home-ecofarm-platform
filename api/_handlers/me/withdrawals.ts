import { createWithdrawalRequestSchema, withdrawalSchema } from '@jad/contracts';

import { verifyUser } from '../../_lib/auth.js';
import type { VercelRequest, VercelResponse } from '../../_lib/http.js';
import {
  fetchWithdrawalIdentifierMap,
  injectWithdrawalIdentifiers,
  mapWithdrawalRow,
} from '../../_lib/money.js';
import { methodNotAllowed, okList, readJsonBody, requireService } from '../../_lib/rest.js';
import { toErrorEnvelope } from '../../_lib/envelope.js';

function idempotencyKey(req: VercelRequest): string | undefined {
  const raw = req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
  const key = Array.isArray(raw) ? raw[0] : raw;
  return typeof key === 'string' && key ? key : undefined;
}

type MoneyResult = {
  error?: { code: string; message: string; status?: number };
  created?: boolean;
  withdrawal?: Record<string, unknown>;
};

function sendMoneyError(res: VercelResponse, result: MoneyResult): boolean {
  if (!result.error) return false;
  const { error, status } = toErrorEnvelope(
    result.error.code as never,
    result.error.message,
    result.error.status ?? 500,
  );
  res.status(status).json({ error });
  return true;
}

/** GET own withdrawals, newest first. */
export async function listWithdrawals(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from('Withdrawal')
    .select('*')
    .eq('memberId', auth.userId)
    .order('createdAt', { ascending: false });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const stored = ((data as unknown[]) ?? []) as Record<string, unknown>[];
  const rawMap = await fetchWithdrawalIdentifierMap(
    supabase,
    stored.map((row) => (typeof row.payoutAccountId === 'string' ? row.payoutAccountId : '')),
    auth.userId,
  );
  const rows = injectWithdrawalIdentifiers(stored, rawMap).map(mapWithdrawalRow);
  okList(
    res,
    rows.filter((row) => withdrawalSchema.safeParse(row).success),
  );
}

/**
 * POST /me/withdrawals — atomic reserve via the DB function (single
 * transaction: wallet row-lock, ledger append, wallet update, idempotency).
 * The function returns {created, withdrawal} or {error}; replays map to 200,
 * fresh reservations to 201.
 */
export async function createWithdrawal(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyUser(req);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const key = idempotencyKey(req);
  if (!key) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Idempotency-Key header is required.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const parsedBody = readJsonBody(req);
  if (!parsedBody.ok) {
    const { error, status } = parsedBody.error;
    res.status(status).json({ error });
    return;
  }
  const parsed = createWithdrawalRequestSchema.safeParse(parsedBody.body ?? {});
  if (!parsed.success) {
    const { error, status } = toErrorEnvelope(
      'VALIDATION_ERROR',
      'Enter an amount and choose a verified payout account.',
      400,
    );
    res.status(status).json({ error });
    return;
  }
  const supabase = requireService(res);
  if (!supabase) return;
  const { data, error } = await supabase.rpc('withdraw_reserve', {
    p_member: auth.userId,
    p_account_id: parsed.data.payoutAccountId,
    p_amount: parsed.data.amount,
    p_key: key,
  });
  if (error) {
    const { error: env, status } = toErrorEnvelope('INTERNAL', error.message, 500);
    res.status(status).json({ error: env });
    return;
  }
  const result = (data ?? {}) as MoneyResult;
  if (sendMoneyError(res, result)) return;
  const created = (result.withdrawal ?? {}) as Record<string, unknown>;
  const account = (created.payoutAccount ?? {}) as Record<string, unknown>;
  const accountId = typeof account.id === 'string' ? account.id : parsed.data.payoutAccountId;
  const rawMap = await fetchWithdrawalIdentifierMap(supabase, [accountId], auth.userId);
  const raw = rawMap.get(accountId);
  res
    .status(result.created ? 201 : 200)
    .json(raw ? { ...created, payoutAccount: { ...account, accountIdentifier: raw } } : created);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method === 'GET') return listWithdrawals(req, res);
  if (req.method === 'POST') return createWithdrawal(req, res);
  methodNotAllowed(res, req.method);
}
