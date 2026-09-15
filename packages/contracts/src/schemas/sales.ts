import { z } from 'zod';

import { exactDecimalStringSchema } from './money.js';

/**
 * Sales resources (API-SPECIFICATION §6.6, FEAT-027..032, FR-SAL-001..007).
 * Property value is snapshotted from the Admin catalog at submission and never
 * changes (BI-006); money stays exact-decimal strings.
 */

/** Sale state machine — CONFIRMED (BUSINESS-RULES §5, DATABASE-DESIGN §7.13). */
export const saleStatusSchema = z.enum([
  'SUBMITTED',
  'ADMIN_APPROVED',
  'PAYMENT_VERIFIED',
  'QUALIFYING_SALE',
  'REJECTED',
  'LOCKED',
]);

export type SaleStatus = z.infer<typeof saleStatusSchema>;

/** Non-member customer record — `GET/POST /customers` (API-SPECIFICATION #23..25, FR-CUS-001/002). */
export const customerSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
});

export type Customer = z.infer<typeof customerSchema>;

export const createCustomerRequestSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
});

export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;

/** Sale — `GET /sales`, `GET /sales/:id` (API-SPECIFICATION #31/#32; AQ own). */
export const saleSchema = z.object({
  id: z.string().min(1),
  status: saleStatusSchema,
  propertyId: z.string().min(1),
  propertyName: z.string().min(1),
  propertyValue: exactDecimalStringSchema,
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  sellerId: z.string().min(1),
  sellerName: z.string().min(1),
  resubmissionCount: z.number().int().nonnegative(),
  rejectionReason: z.string().optional(),
  submittedAt: z.string(),
  approvedAt: z.string().optional(),
  paymentVerifiedAt: z.string().optional(),
  lockedAt: z.string().optional(),
  /**
   * Optional snapshot of the member who referred this customer, chosen from
   * the seller's direct referrals or typed free-form at submission
   * (SCR-MEM-006). Informational only — has no commission effect
   * (BR-REF-001/002).
   */
  referrerName: z.string().optional(),
  /**
   * Configured commission rates for the estimate preview
   * (COMMISSION_DIRECT_RATE / COMMISSION_REFERRAL_RATE, exact-decimal rate
   * strings up to 4 places). Server-populated on detail reads so the UI
   * never hard-codes 8%/4% (BR-CFG-001). Optional: list reads omit it.
   */
  commissionRates: z.object({ direct: z.string().min(1), referral: z.string().min(1) }).optional(),
});

export type Sale = z.infer<typeof saleSchema>;

/**
 * `POST /sales` request (API-SPECIFICATION #30 / §7.1). Only the catalog
 * property id is sent; the value snapshot is server-derived (BR-PRP-003,
 * BI-006). Requires `Idempotency-Key` header (API-SPECIFICATION §5.3).
 */
export const submitSaleRequestSchema = z.object({
  customerId: z.string().min(1),
  propertyId: z.string().min(1),
  /** Optional referrer name snapshot (direct referral pick or free text). */
  referrerName: z.string().trim().min(1).max(120).optional(),
});

export type SubmitSaleRequest = z.infer<typeof submitSaleRequestSchema>;

/** `POST /sales` response — the created sale in `Submitted` (API-SPECIFICATION §7.1). */
export const submitSaleResponseSchema = saleSchema;

export type SubmitSaleResponse = z.infer<typeof submitSaleResponseSchema>;

/** `POST /sales/:id/resubmit` — corrected sale re-enters approval (FR-SAL-005, #36). */
export const resubmitSaleRequestSchema = submitSaleRequestSchema;

export type ResubmitSaleRequest = z.infer<typeof resubmitSaleRequestSchema>;

/**
 * `POST /me/sales/:id/reopen-request` response — the member's request that a
 * LOCKED sale be reopened by Admin/Super Admin review (FR-SAL-007, #89
 * PROPOSED). Recorded and audited; the decision is staff-side.
 */
export const reopenSaleRequestResponseSchema = z.object({
  saleId: z.string().min(1),
  requested: z.literal(true),
});

export type ReopenSaleRequestResponse = z.infer<typeof reopenSaleRequestResponseSchema>;
