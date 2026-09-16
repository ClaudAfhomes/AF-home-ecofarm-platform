import { z } from 'zod';

import { exactDecimalStringSchema } from './money.js';

/**
 * Staff-authored financial adjustment - `GET /admin/adjustments` (Phase B5,
 * SUPER_ADMIN_ONLY). Adjustments correct member balances outside the normal
 * commission/withdrawal flow; the entry type vocabulary reuses the ledger
 * adjustment types (ewallet.ts) but adjustments are standalone records, NOT
 * ledger entries (no running balance - that stays B6 money-core scope).
 * Amounts are exact-decimal STRINGS; `createdBy` is a display name snapshot.
 */
export const adjustmentEntryTypeSchema = z.enum([
  'FINANCIAL_ADJUSTMENT',
  'COMMISSION_REVERSAL',
  'WITHDRAWAL_REVERSAL',
]);

export type AdjustmentEntryType = z.infer<typeof adjustmentEntryTypeSchema>;

export const adjustmentSchema = z.object({
  id: z.string().min(1),
  memberId: z.string().min(1),
  memberName: z.string().min(1),
  entryType: adjustmentEntryTypeSchema,
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: exactDecimalStringSchema,
  reason: z.string().min(1),
  createdBy: z.string().min(1),
  createdAt: z.string(),
});

export type Adjustment = z.infer<typeof adjustmentSchema>;
