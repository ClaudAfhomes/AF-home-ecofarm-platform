import { z } from 'zod';

/**
 * Payout account resources (API-SPECIFICATION §6.9, FEAT-044..046, FR-PAY-001..006).
 * `accountIdentifier` is SENSITIVE (DATABASE-DESIGN §8.3, SECURITY.md).
 * Lists/tables always render `accountIdentifierMasked`; the raw
 * `accountIdentifier` is additionally served to the owning member and
 * FINANCE_VIEW staff so detail modals can show the full number. Never log it.
 * Lifecycle: Pending → Admin Review → Confirmed (BR-PAY-004).
 */

/** Payout account state machine - CONFIRMED (BR-PAY-004, DATABASE-DESIGN §7.19). REJECTED is a frontend mock extension for the Approve/Reject workflow (requires Owner confirmation if made permanent). */
export const payoutAccountStatusSchema = z.enum([
  'PENDING',
  'ADMIN_REVIEW',
  'CONFIRMED',
  'REJECTED',
]);

export type PayoutAccountStatus = z.infer<typeof payoutAccountStatusSchema>;

/**
 * Payout method - candidate categories from BR-PAY-002 / FR-PAY-002. The final
 * supported set is BLOCKED on OD-016 (FEAT-047). This PROPOSED mock set is the
 * minimal contract surface for the Add Payout Account screen; it must be
 * confirmed by the Owner before the real backend lands.
 */
export const payoutMethodSchema = z.enum(['TRADITIONAL_BANK', 'DIGITAL_BANK', 'GCASH', 'OTHER']);

export type PayoutMethod = z.infer<typeof payoutMethodSchema>;

/** Payout account - `GET /me/payout-accounts` (API-SPECIFICATION #48). */
export const payoutAccountSchema = z.object({
  id: z.string().min(1),
  method: payoutMethodSchema,
  accountName: z.string().min(1),
  /** Server-masked identifier - always present; tables render this. */
  accountIdentifierMasked: z.string().min(1),
  /** Raw identifier - present for owner/staff reads; detail modals render this. */
  accountIdentifier: z.string().min(1).optional(),
  status: payoutAccountStatusSchema,
  isPrimary: z.boolean(),
  createdAt: z.string(),
  rejectionReason: z.string().optional(),
});

export type PayoutAccount = z.infer<typeof payoutAccountSchema>;

/** `POST /me/payout-accounts` request (API-SPECIFICATION #49; methods per OD-016). */
export const createPayoutAccountRequestSchema = z.object({
  method: payoutMethodSchema,
  accountName: z.string().min(1),
  accountIdentifier: z.string().min(1),
});

export type CreatePayoutAccountRequest = z.infer<typeof createPayoutAccountRequestSchema>;

/** `PATCH /me/payout-accounts/:id` - designates a single Primary (BR-PAY-006, #50). */
export const setPrimaryPayoutAccountRequestSchema = z.object({
  isPrimary: z.literal(true),
});

export type SetPrimaryPayoutAccountRequest = z.infer<typeof setPrimaryPayoutAccountRequestSchema>;
