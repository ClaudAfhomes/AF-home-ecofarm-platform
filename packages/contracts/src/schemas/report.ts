import { z } from 'zod';

import { commissionStatusSchema, commissionTypeSchema } from './commission.js';
import { exactDecimalStringSchema } from './money.js';
import { saleStatusSchema } from './sales.js';

/**
 * Admin reports (read-only, finance-visible views). Generated server-side
 * from server facts (mirroring admin/queues.ts); every money field stays an
 * exact-decimal string. Served by `GET /admin/reports/sales-commissions` and
 * `GET /admin/reports/summary` - consumed by the Admin Reports page and
 * exported to CSV client-side.
 */

/** One sale row in the sales & commissions report (snapshot fields only). */
export const salesReportRowSchema = z.object({
  id: z.string().min(1),
  propertyName: z.string().min(1),
  sellerName: z.string().min(1),
  status: saleStatusSchema,
  propertyValue: exactDecimalStringSchema,
  referrerName: z.string().optional(),
  submittedAt: z.string(),
});

export type SalesReportRow = z.infer<typeof salesReportRowSchema>;

/** One commission row in the sales & commissions report. */
export const commissionReportRowSchema = z.object({
  id: z.string().min(1),
  saleId: z.string().min(1),
  memberName: z.string().min(1),
  commissionType: commissionTypeSchema,
  amount: exactDecimalStringSchema,
  status: commissionStatusSchema,
  createdAt: z.string(),
  clearedAt: z.string().optional(),
});

export type CommissionReportRow = z.infer<typeof commissionReportRowSchema>;

/** Per-status aggregate: row count plus the exact-decimal money total. */
export const reportBreakdownSchema = z.object({
  count: z.number().int().nonnegative(),
  total: exactDecimalStringSchema,
});

export type ReportBreakdown = z.infer<typeof reportBreakdownSchema>;

/**
 * Status-keyed breakdowns are explicit objects (not records) so the handler
 * must always produce every status key - the UI can index them safely.
 */
export const salesCommissionsReportSchema = z.object({
  /** Echoed request range (ISO dates, inclusive); null = unbounded. */
  range: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
  generatedAt: z.string(),
  sales: z.array(salesReportRowSchema),
  /** Commissions belonging to the reported sales, newest first. */
  commissions: z.array(commissionReportRowSchema),
  summary: z.object({
    salesCount: z.number().int().nonnegative(),
    salesValueTotal: exactDecimalStringSchema,
    salesByStatus: z.object({
      SUBMITTED: reportBreakdownSchema,
      ADMIN_APPROVED: reportBreakdownSchema,
      PAYMENT_VERIFIED: reportBreakdownSchema,
      QUALIFYING_SALE: reportBreakdownSchema,
      REJECTED: reportBreakdownSchema,
      LOCKED: reportBreakdownSchema,
    }),
    commissionsByStatus: z.object({
      PENDING: reportBreakdownSchema,
      AVAILABLE: reportBreakdownSchema,
      CANCELLED: reportBreakdownSchema,
      REVERSED: reportBreakdownSchema,
    }),
  }),
});

export type SalesCommissionsReport = z.infer<typeof salesCommissionsReportSchema>;

/** Whole-org operational snapshot - counts plus outstanding/paid money totals. */
export const operationalSummaryReportSchema = z.object({
  generatedAt: z.string(),
  members: z.object({
    active: z.number().int().nonnegative(),
    inactive: z.number().int().nonnegative(),
    archived: z.number().int().nonnegative(),
  }),
  registrations: z.object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
  sales: z.object({
    total: z.number().int().nonnegative(),
    byStatus: z.object({
      SUBMITTED: z.number().int().nonnegative(),
      ADMIN_APPROVED: z.number().int().nonnegative(),
      PAYMENT_VERIFIED: z.number().int().nonnegative(),
      QUALIFYING_SALE: z.number().int().nonnegative(),
      REJECTED: z.number().int().nonnegative(),
      LOCKED: z.number().int().nonnegative(),
    }),
  }),
  /** PENDING = REQUESTED + RESERVED (money reserved but not yet paid out). */
  withdrawals: z.object({
    pendingCount: z.number().int().nonnegative(),
    pendingTotal: exactDecimalStringSchema,
    completedCount: z.number().int().nonnegative(),
    completedTotal: exactDecimalStringSchema,
    rejectedCount: z.number().int().nonnegative(),
  }),
  commissions: z.object({
    pendingCount: z.number().int().nonnegative(),
    pendingTotal: exactDecimalStringSchema,
    availableCount: z.number().int().nonnegative(),
    availableTotal: exactDecimalStringSchema,
  }),
  /** Contact inquiries awaiting triage (status NEW). */
  inquiries: z.object({
    new: z.number().int().nonnegative(),
  }),
});

export type OperationalSummaryReport = z.infer<typeof operationalSummaryReportSchema>;
