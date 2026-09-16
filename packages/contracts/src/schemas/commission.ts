import { z } from 'zod';

import { exactDecimalRateSchema, exactDecimalStringSchema } from './money.js';

/**
 * Commission resources (API-SPECIFICATION §6.7, FEAT-033..040, FR-COM-001..012).
 * Commission records are IMMUTABLE (BI-005); corrections use separate ledger
 * transactions (BR-LED-002). GROUP_INCENTIVE is OD-gated - the API must not
 * produce it yet (FR-COM-013, OD-006..012).
 */

/** Commission state machine - CONFIRMED (BUSINESS-RULES §5, DATABASE-DESIGN §7.15). */
export const commissionStatusSchema = z.enum(['PENDING', 'AVAILABLE', 'CANCELLED', 'REVERSED']);

export type CommissionStatus = z.infer<typeof commissionStatusSchema>;

/** Commission kind (FR-COM-013). GROUP_INCENTIVE is OD-gated; not produced yet. */
export const commissionTypeSchema = z.enum([
  'DIRECT_COMMISSION',
  'DIRECT_REFERRAL',
  'GROUP_INCENTIVE',
]);

export type CommissionType = z.infer<typeof commissionTypeSchema>;

/**
 * Commission - `GET /me/commissions` (API-SPECIFICATION #39). Base value and
 * rate are snapshots recorded at qualification time (BI-006); `amount` is
 * `base_value × rate`. Money stays exact-decimal strings; `rate` is the
 * numeric(5,4) rate as a string (e.g. `0.0800`).
 */
export const commissionSchema = z.object({
  id: z.string().min(1),
  commissionType: commissionTypeSchema,
  /** The qualifying sale the commission was created for (FK `commissions.sale_id`). */
  saleId: z.string().min(1),
  /** Sale property name - presentation enrichment joined server-side (UI-UX §5.5). */
  salePropertyName: z.string().min(1),
  baseValue: exactDecimalStringSchema,
  rate: exactDecimalRateSchema,
  amount: exactDecimalStringSchema,
  status: commissionStatusSchema,
  clearedAt: z.string().optional(),
  cancelledAt: z.string().optional(),
  reversedAt: z.string().optional(),
  createdAt: z.string(),
});

export type Commission = z.infer<typeof commissionSchema>;

/**
 * Commission clearing batch result - `POST /admin/commissions/clear-due`
 * and `GET /crons/commission-clearing`. Counts the PENDING commissions moved
 * to AVAILABLE in this run; `total` is the cleared exact-decimal sum.
 */
export const commissionClearBatchSchema = z.object({
  cleared: z.number().int().nonnegative(),
  total: exactDecimalStringSchema,
  windowDays: z.number().int().nonnegative(),
});

export type CommissionClearBatch = z.infer<typeof commissionClearBatchSchema>;
