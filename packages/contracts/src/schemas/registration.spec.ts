import { describe, expect, it } from 'vitest';

import { archivedMemberSchema, registrationSchema, registrationStatusSchema } from './registration';

const BASE = {
  id: 'reg-001',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  phone: '+639171234567',
  dateOfBirth: '1990-01-01',
  gender: 'Male',
  countryCode: 'PH',
  countryName: 'Philippines',
  programId: 'prg-domestic',
  programCode: 'DOMESTIC',
  qualificationAnswers: [],
  submittedAt: '2026-08-01T00:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('registrationStatusSchema', () => {
  it('allows only PENDING and REJECTED (no APPROVED_ACTIVE in registrations)', () => {
    expect(registrationStatusSchema.safeParse('PENDING').success).toBe(true);
    expect(registrationStatusSchema.safeParse('REJECTED').success).toBe(true);
    // Approval moves the application to Member - APPROVED_ACTIVE lives in
    // the Member domain, never in Registration.
    expect(registrationStatusSchema.safeParse('APPROVED_ACTIVE').success).toBe(false);
  });
});

describe('registrationSchema', () => {
  it('accepts PENDING and REJECTED applications', () => {
    expect(registrationSchema.safeParse({ ...BASE, status: 'PENDING' }).success).toBe(true);
    expect(registrationSchema.safeParse({ ...BASE, status: 'REJECTED' }).success).toBe(true);
  });

  it('rejects APPROVED_ACTIVE applications', () => {
    expect(registrationSchema.safeParse({ ...BASE, status: 'APPROVED_ACTIVE' }).success).toBe(
      false,
    );
  });
});

describe('archivedMemberSchema', () => {
  it('accepts a member snapshot as originalData (archive snapshots members)', () => {
    const result = archivedMemberSchema.safeParse({
      id: 'arch-001',
      memberId: 'mem-012',
      originalData: {
        id: 'mem-012',
        firstName: 'Sofia',
        lastName: 'Reyes',
        dateOfBirth: '1990-03-03',
        age: 36,
        gender: 'Female',
        address: 'Manila, PH',
        countryCode: 'PH',
        countryName: 'Philippines',
        phone: '+63 920 555 012',
        email: 'sofia.reyes@example.com',
        referralCode: 'JAD-SOFIA01',
        status: 'APPROVED_ACTIVE',
        isQualified: true,
        program: { id: 'prg-domestic', code: 'DOMESTIC', name: 'Domestic Program' },
      },
      archivedAt: '2026-08-14T10:00:00.000Z',
      archivedBy: 'admin-001',
      previousStatus: 'APPROVED_ACTIVE',
      previousAccountStatus: 'ACTIVE',
    });
    expect(result.success).toBe(true);
  });
});
