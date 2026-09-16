import {
  commissionSchema,
  ledgerEntrySchema,
  walletSchema,
  withdrawalSchema,
} from '@jad/contracts';
import { addMoney, compareMoney, subtractMoney } from '@jad/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Money-core helpers for api/ handlers (Phase B6). Pure functions —
 * unit-tested. All arithmetic is exact-decimal strings via `@jad/shared`
 * (BigInt cents — never floats). Handlers own Supabase I/O.
 */

/** Server-side mask of a payout account identifier (SECURITY.md — sensitive on read). */
export function maskIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.length <= 4) return '••••';
  return `•••• ${trimmed.slice(-4)}`;
}

/** Zero wallet — mirrors the mock default for members with no wallet row. */
export function zeroWallet() {
  return {
    availableBalance: '0.00',
    pendingAmount: '0.00',
    totalWithdrawals: '0.00',
    totalEarned: '0.00',
  };
}

export function isValidWalletRow(row: Record<string, unknown>): boolean {
  return walletSchema.safeParse(row).success;
}

/**
 * Running Available Balance over a member's FULL append-only ledger, id-asc.
 * A WITHDRAWAL_COMPLETION finalizes an already-reserved deduction (BR-WDR-003)
 * and therefore does not move the balance. Type filtering and pagination
 * happen AFTER this computation (ledger endpoint mirrors the mock).
 */
export function withRunningBalance(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  let balance = '0.00';
  return rows.map((row) => {
    if (row.entryType !== 'WITHDRAWAL_COMPLETION') {
      const amount = typeof row.amount === 'string' ? row.amount : '0.00';
      balance =
        row.direction === 'CREDIT' ? addMoney(balance, amount) : subtractMoney(balance, amount);
    }
    return { ...row, balanceAfter: balance };
  });
}

/** Allowlisted `?type=` ledger filter keys (ledger endpoint). */
export const LEDGER_TYPE_ALLOWLIST = [
  'DIRECT_COMMISSION',
  'DIRECT_REFERRAL',
  'GROUP_INCENTIVE',
  'WITHDRAWAL',
  'WITHDRAWAL_RESERVATION',
  'WITHDRAWAL_COMPLETION',
  'WITHDRAWAL_REVERSAL',
  'COMMISSION_REVERSAL',
  'FINANCIAL_ADJUSTMENT',
] as const;

export function mapLedgerRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    entryType: row.entryType,
    direction: row.direction,
    amount: row.amount,
    createdAt: row.createdAt,
    balanceAfter: row.balanceAfter ?? undefined,
  };
}

export function isValidLedgerRow(row: Record<string, unknown>): boolean {
  return ledgerEntrySchema.safeParse(mapLedgerRow(row)).success;
}

function withdrawalPayoutSnapshot(row: Record<string, unknown>) {
  // Idempotent: an already-mapped row carries the snapshot object instead of
  // flat join fields — reuse it so validate-after-map never drops valid rows.
  const snapshot =
    row.payoutAccount && typeof row.payoutAccount === 'object'
      ? (row.payoutAccount as Record<string, unknown>)
      : undefined;
  const raw =
    typeof row.accountIdentifier === 'string' && row.accountIdentifier
      ? row.accountIdentifier
      : typeof snapshot?.accountIdentifier === 'string' && snapshot.accountIdentifier
        ? (snapshot.accountIdentifier as string)
        : undefined;
  return {
    id:
      typeof row.payoutAccountId === 'string'
        ? row.payoutAccountId
        : typeof snapshot?.id === 'string'
          ? snapshot.id
          : '',
    method: row.accountMethod ?? snapshot?.method ?? 'OTHER',
    accountName: row.accountName ?? snapshot?.accountName ?? 'Payout account',
    accountIdentifierMasked:
      typeof row.accountIdentifierMasked === 'string'
        ? row.accountIdentifierMasked
        : typeof snapshot?.accountIdentifierMasked === 'string'
          ? snapshot.accountIdentifierMasked
          : '••••',
    ...(raw ? { accountIdentifier: raw } : {}),
  };
}

/**
 * Inject live raw identifiers into withdrawal rows before mapping.
 * Withdrawal rows persist only the masked snapshot; the raw number is joined
 * from PayoutAccount (which the caller fetched). Missing entries fall back
 * to the masked snapshot — never throws.
 */
export function injectWithdrawalIdentifiers(
  rows: Record<string, unknown>[],
  rawByAccountId: Map<string, string>,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const accountId = typeof row.payoutAccountId === 'string' ? row.payoutAccountId : '';
    const raw = accountId ? rawByAccountId.get(accountId) : undefined;
    return raw ? { ...row, accountIdentifier: raw } : row;
  });
}

/**
 * Batch-fetch raw identifiers for withdrawal enrichment. Member-scoped when
 * `memberId` is given (owner reads); unscoped for FINANCE_VIEW staff.
 * Degrades to an empty map on any failure so callers fall back to masked.
 */
export async function fetchWithdrawalIdentifierMap(
  supabase: Pick<SupabaseClient, 'from'>,
  payoutAccountIds: string[],
  memberId?: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(payoutAccountIds.filter(Boolean))];
  if (ids.length === 0) return out;
  try {
    const query = supabase.from('PayoutAccount').select('id,accountIdentifier');
    const { data, error } = memberId
      ? await query.eq('memberId', memberId).in('id', ids)
      : await query.in('id', ids);
    if (error || !Array.isArray(data)) return out;
    for (const row of data as { id?: unknown; accountIdentifier?: unknown }[]) {
      if (
        typeof row.id === 'string' &&
        typeof row.accountIdentifier === 'string' &&
        row.accountIdentifier
      ) {
        out.set(row.id, row.accountIdentifier);
      }
    }
  } catch {
    return out;
  }
  return out;
}

/** Withdrawal row → member/staff contract shape (snapshot embedded). */
export function mapWithdrawalRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    amount: row.amount,
    status: row.status,
    payoutAccount: withdrawalPayoutSnapshot(row),
    reservedAt: row.reservedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    rejectedAt: row.rejectedAt ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    externalReference: row.externalReference ?? undefined,
    createdAt: row.createdAt,
  };
}

export function isValidWithdrawalRow(row: Record<string, unknown>): boolean {
  return withdrawalSchema.safeParse(mapWithdrawalRow(row)).success;
}

/** Commission row → contract shape; property name joins from the sale. */
export function mapCommissionRow(row: Record<string, unknown>, salePropertyName?: string) {
  return {
    id: row.id,
    commissionType: row.commissionType,
    saleId: row.saleId,
    salePropertyName: salePropertyName ?? (typeof row.saleId === 'string' ? row.saleId : ''),
    baseValue: row.baseValue,
    rate: row.rate,
    amount: row.amount,
    status: row.status,
    clearedAt: row.clearedAt ?? undefined,
    cancelledAt: row.cancelledAt ?? undefined,
    reversedAt: row.reversedAt ?? undefined,
    createdAt: row.createdAt,
  };
}

export function isValidCommissionRow(
  row: Record<string, unknown>,
  salePropertyName?: string,
): boolean {
  return commissionSchema.safeParse(mapCommissionRow(row, salePropertyName)).success;
}

/** Reserve guard: amount must be positive and within the available balance (BR-WDR-001/002, BI-001). */
export function validateReserve(
  amount: string,
  availableBalance: string,
):
  | { ok: true }
  | {
      ok: false;
      code: 'VALIDATION_ERROR' | 'INSUFFICIENT_BALANCE';
      message: string;
      status: 400 | 409;
    } {
  if (compareMoney(amount, '0.00') <= 0) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Enter a withdrawal amount greater than zero.',
      status: 400,
    };
  }
  if (compareMoney(amount, availableBalance) > 0) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'The withdrawal amount exceeds your Available Balance.',
      status: 409,
    };
  }
  return { ok: true };
}

export { addMoney, compareMoney, subtractMoney };
