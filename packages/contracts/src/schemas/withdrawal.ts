import { z } from 'zod';

import { exactDecimalStringSchema } from './money.js';
import { payoutMethodSchema } from './payout.js';

/**
 * Withdrawal resources (API-SPECIFICATION §6.10, FEAT-048..050, FR-WDR-001..005).
 * Reservation: request ≤ Available Balance; funds reserved and not reusable
 * (BR-WDR-001/002). Rejected withdrawals are NOT editable/resubmittable - a new
 * request is required (BR-WDR-005). Final status model is TBD (OD-017/018) - do
 * not add states beyond the confirmed vocabulary.
 */

/** Withdrawal state machine - CONFIRMED (BUSINESS-RULES §5, DATABASE-DESIGN §7.20). */
export const withdrawalStatusSchema = z.enum(['REQUESTED', 'RESERVED', 'COMPLETED', 'REJECTED']);

export type WithdrawalStatus = z.infer<typeof withdrawalStatusSchema>;

/**
 * Minimal payout account summary embedded in a withdrawal. Tables render
 * `accountIdentifierMasked`; detail views render `accountIdentifier` when
 * present (owner/staff reads join the live PayoutAccount row).
 */
export const withdrawalPayoutAccountSchema = z.object({
  id: z.string().min(1),
  method: payoutMethodSchema,
  accountName: z.string().min(1),
  accountIdentifierMasked: z.string().min(1),
  accountIdentifier: z.string().min(1).optional(),
});

export type WithdrawalPayoutAccount = z.infer<typeof withdrawalPayoutAccountSchema>;

/** Withdrawal - `GET /me/withdrawals`, `GET /me/withdrawals/:id` (#55/#56). */
export const withdrawalSchema = z.object({
  id: z.string().min(1),
  amount: exactDecimalStringSchema,
  status: withdrawalStatusSchema,
  payoutAccount: withdrawalPayoutAccountSchema,
  reservedAt: z.string().optional(),
  completedAt: z.string().optional(),
  rejectedAt: z.string().optional(),
  /** Mandatory when rejected (BR-WDR-004). */
  rejectionReason: z.string().optional(),
  /** Record-only external execution reference (FEAT-070, BR-BND-001). */
  externalReference: z.string().optional(),
  createdAt: z.string(),
});

export type Withdrawal = z.infer<typeof withdrawalSchema>;

/**
 * `POST /me/withdrawals` request (API-SPECIFICATION #54 / §7.2). Requires an
 * `Idempotency-Key` header (API-SPECIFICATION §5.3); amount ≤ Available Balance
 * (409 `INSUFFICIENT_BALANCE`); verified payout account only (422
 * `PAYOUT_ACCOUNT_UNVERIFIED`, BR-PAY-005).
 */
export const createWithdrawalRequestSchema = z.object({
  amount: exactDecimalStringSchema,
  payoutAccountId: z.string().min(1),
});

export type CreateWithdrawalRequest = z.infer<typeof createWithdrawalRequestSchema>;
