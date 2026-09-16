import { describe, expect, it } from 'vitest';

import { ADMIN_STAFF, FINANCE_VIEW, SUPER_ADMIN_ONLY } from './access.js';
import {
  applyResubmit,
  calculateAge,
  findCatalogPrice,
  isValidAdjustmentRow,
  isValidCustomerRow,
  isValidPayoutAccountRow,
  isValidPropertyRow,
  isValidSaleRow,
  isValidVoucherRow,
  isValidVoucherTemplateRow,
  mapAdjustmentRow,
  mapCustomerRow,
  mapPayoutAccountRow,
  mapPropertyRow,
  mapSaleRow,
  mapVoucherRow,
  mapVoucherTemplateRow,
  prefixedId,
  validateSaleTransition,
} from './pipeline.js';

describe('validateSaleTransition', () => {
  it('allows the documented forward transitions', () => {
    expect(validateSaleTransition('SUBMITTED', { status: 'ADMIN_APPROVED' })).toBeNull();
    expect(validateSaleTransition('ADMIN_APPROVED', { status: 'PAYMENT_VERIFIED' })).toBeNull();
    expect(validateSaleTransition('PAYMENT_VERIFIED', { status: 'QUALIFYING_SALE' })).toBeNull();
  });

  it('rejects skips, backward moves, and terminal edits', () => {
    expect(validateSaleTransition('SUBMITTED', { status: 'QUALIFYING_SALE' })).toContain(
      'Cannot transition',
    );
    expect(validateSaleTransition('LOCKED', { status: 'SUBMITTED' })).toContain(
      'Cannot transition',
    );
    expect(validateSaleTransition('QUALIFYING_SALE', { status: 'REJECTED' })).toContain(
      'Cannot transition',
    );
    expect(validateSaleTransition('REJECTED', { status: 'SUBMITTED' })).toContain(
      'Cannot transition',
    );
  });

  it('requires a rejection reason', () => {
    expect(
      validateSaleTransition('SUBMITTED', { status: 'REJECTED', rejectionReason: '  ' }),
    ).toContain('reason');
    expect(
      validateSaleTransition('SUBMITTED', { status: 'REJECTED', rejectionReason: 'Bad docs' }),
    ).toBeNull();
  });

  it('ignores patches without a status change', () => {
    expect(validateSaleTransition('SUBMITTED', {})).toBeNull();
  });
});

describe('applyResubmit', () => {
  it('increments and resubmits below max', () => {
    expect(applyResubmit('REJECTED', 1, 3)).toEqual({ status: 'SUBMITTED', resubmissionCount: 2 });
  });

  it('locks exactly at max (BR-SAL-006)', () => {
    expect(applyResubmit('REJECTED', 2, 3)).toEqual({ status: 'LOCKED', resubmissionCount: 3 });
    expect(applyResubmit('REJECTED', 3, 3)).toEqual({
      error: 'This sale has reached the maximum resubmission attempts and is locked.',
    });
  });

  it('rejects non-rejected states', () => {
    expect(applyResubmit('SUBMITTED', 0, 3)).toEqual({
      error: 'Only a rejected sale can be resubmitted.',
    });
    expect(applyResubmit('LOCKED', 3, 3)).toEqual({
      error: 'Only a rejected sale can be resubmitted.',
    });
  });
});

describe('findCatalogPrice', () => {
  const content = {
    properties: [
      { id: 'a', name: 'A House', price: '100.00' },
      { id: 'b', name: 'B Lot', price: '0.00' },
      { id: 'c', name: 'C Condo' },
    ],
  };

  it('resolves priced listings', () => {
    expect(findCatalogPrice(content, 'a')).toEqual({ name: 'A House', price: '100.00' });
  });

  it('rejects missing, unpriced, and zero-priced listings', () => {
    expect(findCatalogPrice(content, 'nope')).toBeNull();
    expect(findCatalogPrice(content, 'b')).toBeNull();
    expect(findCatalogPrice(content, 'c')).toBeNull();
    expect(findCatalogPrice(null, 'a')).toBeNull();
  });
});

describe('calculateAge / prefixedId', () => {
  it('computes whole-year age deterministically', () => {
    expect(calculateAge('2000-01-15', new Date('2026-01-14T00:00:00Z'))).toBe(25);
    expect(calculateAge('2000-01-15', new Date('2026-01-15T00:00:00Z'))).toBe(26);
  });

  it('prefixes timestamp ids', () => {
    expect(prefixedId('sal')).toMatch(/^sal-[a-z0-9]+$/);
  });
});

describe('sale/customer row mapping', () => {
  it('maps and validates a complete sale row', () => {
    const row = {
      id: 'sal-1',
      status: 'SUBMITTED',
      propertyId: 'p',
      propertyName: 'P',
      propertyValue: '10.00',
      customerId: 'c',
      customerName: 'C',
      sellerId: 'm',
      sellerName: 'M',
      submittedAt: '2026-08-18T00:00:00.000Z',
      resubmissionCount: 0,
    };
    expect(isValidSaleRow(row)).toBe(true);
    expect(mapSaleRow(row).rejectionReason).toBeUndefined();
  });

  it('maps DB rows and tolerates missing phones', () => {
    expect(isValidCustomerRow({ id: 'c', name: 'C', phone: '123' })).toBe(true);
    expect(mapCustomerRow({ id: 'c', name: 'C' }).phone).toBe('-');
    expect(isValidCustomerRow({ id: 'c' })).toBe(false);
  });

  it('keeps valid rows through map-then-validate (list handlers filter mapped rows)', () => {
    const customer = mapCustomerRow({ id: 'c', memberId: 'm', name: 'C', phone: '123' });
    expect(isValidCustomerRow(customer)).toBe(true);
    const property = mapPropertyRow({
      id: 'p',
      name: 'Lot',
      categorySlug: 'cat',
      price: '100.00',
      status: 'ACTIVE',
    });
    expect(isValidPropertyRow(property)).toBe(true);
  });
});

describe('B5 money-list row mapping', () => {
  it('maps categorySlug to categoryId and validates a property row', () => {
    const row = {
      id: 'igp-250-sqm-farm-lot',
      name: '250 sqm Farm Lot',
      categorySlug: 'income-generating-properties',
      price: '2500000.00',
      status: 'ACTIVE',
    };
    expect(mapPropertyRow(row)).toEqual({
      id: 'igp-250-sqm-farm-lot',
      name: '250 sqm Farm Lot',
      categoryId: 'income-generating-properties',
      price: '2500000.00',
      status: 'ACTIVE',
    });
    expect(isValidPropertyRow(row)).toBe(true);
    expect(isValidPropertyRow({ ...row, status: 'SOLD' })).toBe(false);
  });

  it('validates a payout account row and drops unknown statuses', () => {
    const row = {
      id: 'pac-001',
      method: 'GCASH',
      accountName: 'Juan Dela Cruz',
      accountIdentifierMasked: '09171234567',
      status: 'PENDING',
      isPrimary: false,
      createdAt: '2026-08-15T10:00:00.000Z',
    };
    expect(isValidPayoutAccountRow(row)).toBe(true);
    expect(mapPayoutAccountRow(row).rejectionReason).toBeUndefined();
    expect(isValidPayoutAccountRow({ ...row, status: 'APPROVED' })).toBe(false);
  });

  it('masks raw identifiers on output, keeping legacy pre-masked rows working', () => {
    const memberOwned = {
      id: 'pa-001',
      memberId: 'mem-uuid-1',
      method: 'GCASH',
      accountName: 'Juan Dela Cruz',
      accountIdentifier: '09175550199',
      status: 'CONFIRMED',
      isPrimary: true,
      createdAt: '2026-08-01T00:00:00.000Z',
    };
    expect(mapPayoutAccountRow(memberOwned).accountIdentifierMasked).toBe('•••• 0199');
    expect(mapPayoutAccountRow(memberOwned).accountIdentifier).toBe('09175550199');
    expect(isValidPayoutAccountRow(memberOwned)).toBe(true);
    expect(isValidPayoutAccountRow({ ...memberOwned, method: 'CASH' })).toBe(false);
    // Empty raw identifier falls back to the stored masked value or full mask.
    expect(
      mapPayoutAccountRow({ ...memberOwned, accountIdentifier: '' }).accountIdentifierMasked,
    ).toBe('••••');
  });

  it('validates voucher template and voucher rows', () => {
    expect(
      isValidVoucherTemplateRow({
        id: 'vtpl-001',
        title: 'Welcome Gift',
        originalValue: '500.00',
        createdAt: '2026-08-01T10:00:00.000Z',
        expiresAt: '2026-12-31T10:00:00.000Z',
      }),
    ).toBe(true);
    const voucher = {
      id: 'vch-101',
      code: 'JAD-VCH-2026-101',
      title: 'Welcome Gift',
      originalValue: '500.00',
      remainingValue: '500.00',
      status: 'ACTIVE',
      createdAt: '2026-08-17T10:00:00.000Z',
    };
    expect(isValidVoucherRow(voucher)).toBe(true);
    expect(mapVoucherRow(voucher).expiresAt).toBeUndefined();
    expect(isValidVoucherRow({ ...voucher, remainingValue: 'abc' })).toBe(false);
  });

  it('validates an adjustment row and rejects unknown entry types', () => {
    const row = {
      id: 'adj-001',
      memberId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      memberName: 'Maria Santos',
      entryType: 'FINANCIAL_ADJUSTMENT',
      direction: 'CREDIT',
      amount: '250.00',
      reason: 'Correction for missing referral credit on sale sal-002',
      createdBy: 'Ada Admin',
      createdAt: '2026-08-18T11:00:00.000Z',
    };
    expect(isValidAdjustmentRow(row)).toBe(true);
    expect(mapAdjustmentRow(row).memberName).toBe('Maria Santos');
    expect(isValidAdjustmentRow({ ...row, entryType: 'BONUS' })).toBe(false);
  });
});

describe('access matrix constants', () => {
  it('nests from narrowest to widest', () => {
    expect([...SUPER_ADMIN_ONLY]).toEqual(['super_admin']);
    expect([...ADMIN_STAFF].sort()).toEqual(['admin', 'super_admin']);
    expect([...FINANCE_VIEW].sort()).toEqual(['admin', 'finance', 'super_admin']);
  });
});
