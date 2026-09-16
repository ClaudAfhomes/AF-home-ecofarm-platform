import { z } from 'zod';

import { exactDecimalStringSchema } from './money.js';

/**
 * Money arrives as exact-decimal STRINGS (BR-WAL-002 / DATABASE-DESIGN §7.17;
 * NUMERIC, floats rejected - API-SPECIFICATION §1.3). Never treated as numbers.
 */

/** eWallet summary - `GET /me/wallet` (API-SPECIFICATION #43, FEAT-043, FR-WAL-003/004). */
export const walletSchema = z.object({
  /** Available Balance - never negative (BI-001). */
  availableBalance: exactDecimalStringSchema,
  /** Sum of PENDING commissions - excluded from Available (BI-002, BR-WAL-003). */
  pendingAmount: exactDecimalStringSchema,
  /** Total amount of completed/reserved withdrawals - server-computed aggregate. */
  totalWithdrawals: exactDecimalStringSchema.optional(),
  /** Ledger-defined total earned - server-computed aggregate (BR-RPT-003). */
  totalEarned: exactDecimalStringSchema.optional(),
});

export type Wallet = z.infer<typeof walletSchema>;

/** Ledger entry types - confirmed set (BR-WAL-001, FR-WAL-002). GROUP_INCENTIVE is OD-gated; the API may not produce it yet. */
export const ledgerEntryTypeSchema = z.enum([
  'DIRECT_COMMISSION',
  'DIRECT_REFERRAL',
  'GROUP_INCENTIVE',
  'WITHDRAWAL',
  'WITHDRAWAL_RESERVATION',
  'WITHDRAWAL_COMPLETION',
  'WITHDRAWAL_REVERSAL',
  'COMMISSION_REVERSAL',
  'FINANCIAL_ADJUSTMENT',
]);

export type LedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>;

/** Ledger entry - `GET /me/ledger` (API-SPECIFICATION #44, FR-WAL-001/002). Append-only; immutable (BI-005). */
export const ledgerEntrySchema = z.object({
  id: z.string().min(1),
  entryType: ledgerEntryTypeSchema,
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: exactDecimalStringSchema,
  createdAt: z.string(),
  /**
   * Server-computed running Available Balance after this entry (SCR-MEM-009
   * "running balance"). Optional for API compatibility; the client never
   * derives balances (BI-001 - server-authoritative).
   */
  balanceAfter: exactDecimalStringSchema.optional(),
});

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
