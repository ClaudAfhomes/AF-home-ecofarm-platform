import { describe, expect, it } from 'vitest';

import {
  commissionReportRowSchema,
  operationalSummaryReportSchema,
  salesCommissionsReportSchema,
  salesReportRowSchema,
} from './report';

const SALE_ROW = {
  id: 'sal-001',
  propertyName: 'Farm Lot 12',
  sellerName: 'Juan Dela Cruz',
  status: 'QUALIFYING_SALE' as const,
  propertyValue: '1200000.00',
  submittedAt: '2026-09-01T00:00:00.000Z',
};

const COMMISSION_ROW = {
  id: 'com-001',
  saleId: 'sal-001',
  memberName: 'Juan Dela Cruz',
  commissionType: 'DIRECT_COMMISSION' as const,
  amount: '96000.00',
  status: 'AVAILABLE' as const,
  createdAt: '2026-09-02T00:00:00.000Z',
};

describe('salesReportRowSchema', () => {
  it('accepts a valid snapshot row and optional referrer', () => {
    expect(salesReportRowSchema.safeParse(SALE_ROW).success).toBe(true);
    expect(salesReportRowSchema.safeParse({ ...SALE_ROW, referrerName: 'Maria' }).success).toBe(
      true,
    );
  });

  it('rejects float money and unknown statuses', () => {
    expect(
      salesReportRowSchema.safeParse({ ...SALE_ROW, propertyValue: 1200000 }).success,
    ).toBe(false);
    expect(
      salesReportRowSchema.safeParse({ ...SALE_ROW, propertyValue: '1,200,000.00' }).success,
    ).toBe(false);
    expect(
      salesReportRowSchema.safeParse({ ...SALE_ROW, propertyValue: '1200000.000' }).success,
    ).toBe(false);
    expect(salesReportRowSchema.safeParse({ ...SALE_ROW, status: 'APPROVED' }).success).toBe(
      false,
    );
  });
});

describe('commissionReportRowSchema', () => {
  it('accepts a valid row with optional clearedAt', () => {
    expect(commissionReportRowSchema.safeParse(COMMISSION_ROW).success).toBe(true);
    expect(
      commissionReportRowSchema.safeParse({ ...COMMISSION_ROW, clearedAt: '2026-09-09T00:00:00.000Z' })
        .success,
    ).toBe(true);
  });

  it('rejects amount not an exact-decimal string', () => {
    expect(commissionReportRowSchema.safeParse({ ...COMMISSION_ROW, amount: '96.000' }).success).toBe(
      false,
    );
    expect(commissionReportRowSchema.safeParse({ ...COMMISSION_ROW, amount: '9,600.00' }).success).toBe(
      false,
    );
  });
});

const FULL_REPORT = {
  range: { from: '2026-09-01', to: '2026-09-30' },
  generatedAt: '2026-09-18T00:00:00.000Z',
  sales: [SALE_ROW],
  commissions: [COMMISSION_ROW],
  summary: {
    salesCount: 1,
    salesValueTotal: '1200000.00',
    salesByStatus: {
      SUBMITTED: { count: 0, total: '0.00' },
      ADMIN_APPROVED: { count: 0, total: '0.00' },
      PAYMENT_VERIFIED: { count: 0, total: '0.00' },
      QUALIFYING_SALE: { count: 1, total: '1200000.00' },
      REJECTED: { count: 0, total: '0.00' },
      LOCKED: { count: 0, total: '0.00' },
    },
    commissionsByStatus: {
      PENDING: { count: 0, total: '0.00' },
      AVAILABLE: { count: 1, total: '96000.00' },
      CANCELLED: { count: 0, total: '0.00' },
      REVERSED: { count: 0, total: '0.00' },
    },
  },
};

describe('salesCommissionsReportSchema', () => {
  it('accepts a full report with nullable range', () => {
    expect(salesCommissionsReportSchema.safeParse(FULL_REPORT).success).toBe(true);
    expect(
      salesCommissionsReportSchema.safeParse({ ...FULL_REPORT, range: { from: null, to: null } })
        .success,
    ).toBe(true);
  });

  it('requires every status key in the breakdowns', () => {
    const missing = {
      ...FULL_REPORT,
      summary: {
        ...FULL_REPORT.summary,
        salesByStatus: {
          ...FULL_REPORT.summary.salesByStatus,
          LOCKED: undefined,
        },
      },
    };
    expect(salesCommissionsReportSchema.safeParse(missing).success).toBe(false);
  });
});

describe('operationalSummaryReportSchema', () => {
  it('accepts a valid summary with zeroed money totals', () => {
    expect(
      operationalSummaryReportSchema.safeParse({
        generatedAt: '2026-09-18T00:00:00.000Z',
        members: { active: 3, inactive: 0, archived: 1 },
        registrations: { total: 5, pending: 1, rejected: 1 },
        sales: {
          total: 2,
          byStatus: {
            SUBMITTED: 1,
            ADMIN_APPROVED: 0,
            PAYMENT_VERIFIED: 0,
            QUALIFYING_SALE: 1,
            REJECTED: 0,
            LOCKED: 0,
          },
        },
        withdrawals: {
          pendingCount: 1,
          pendingTotal: '5000.00',
          completedCount: 0,
          completedTotal: '0.00',
          rejectedCount: 0,
        },
        commissions: {
          pendingCount: 0,
          pendingTotal: '0.00',
          availableCount: 1,
          availableTotal: '96000.00',
        },
        inquiries: { new: 2 },
      }).success,
    ).toBe(true);
  });

  it('rejects float money totals', () => {
    expect(
      operationalSummaryReportSchema.safeParse({
        generatedAt: '2026-09-18T00:00:00.000Z',
        members: { active: 3, inactive: 0, archived: 1 },
        registrations: { total: 5, pending: 1, rejected: 1 },
        sales: {
          total: 0,
          byStatus: {
            SUBMITTED: 0,
            ADMIN_APPROVED: 0,
            PAYMENT_VERIFIED: 0,
            QUALIFYING_SALE: 0,
            REJECTED: 0,
            LOCKED: 0,
          },
        },
        withdrawals: {
          pendingCount: 1,
          pendingTotal: 5000,
          completedCount: 0,
          completedTotal: '0.00',
          rejectedCount: 0,
        },
        commissions: {
          pendingCount: 0,
          pendingTotal: '0.00',
          availableCount: 0,
          availableTotal: '0.00',
        },
        inquiries: { new: 0 },
      }).success,
    ).toBe(false);
  });
});
