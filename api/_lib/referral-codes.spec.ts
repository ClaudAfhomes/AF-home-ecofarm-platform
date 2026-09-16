import { describe, expect, it } from 'vitest';

import {
  generateReferralCode,
  isReferralCodeConflict,
  isReferralCodeTaken,
  pickUniqueReferralCode,
} from './referral-codes.js';

describe('generateReferralCode', () => {
  it('keeps the JAD-LAST5 shape with a 4-char suffix', () => {
    expect(generateReferralCode('Dela Cruz')).toMatch(/^JAD-DELAC[A-HJ-NP-Z2-9]{4}$/);
  });

  it('falls back for empty or non-ASCII last names', () => {
    expect(generateReferralCode('')).toMatch(/^JAD-MEMBER[A-HJ-NP-Z2-9]{4}$/);
    expect(generateReferralCode('Ñoño!')).toMatch(/^JAD-OO[A-HJ-NP-Z2-9]{4}$/);
  });

  it('produces high-entropy codes in bulk (birthday collisions are rare)', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateReferralCode('Reyes')));
    // 4 chars × 32-symbol alphabet ≈ 1M combos; 500 draws should be ~all unique.
    expect(codes.size).toBeGreaterThan(490);
  });
});

describe('isReferralCodeTaken', () => {
  it('compares case-insensitively and tolerates nulls', () => {
    expect(isReferralCodeTaken(['JAD-DOE12', null, undefined], 'jad-doe12')).toBe(true);
    expect(isReferralCodeTaken(['JAD-DOE12'], 'JAD-DOE13')).toBe(false);
  });
});

describe('pickUniqueReferralCode', () => {
  it('avoids existing codes including the sponsor code', () => {
    const code = pickUniqueReferralCode(['JD-2026-001', 'JAD-JUAN001'], 'Juan');
    expect(code.toLowerCase()).not.toBe('jd-2026-001');
    expect(isReferralCodeTaken(['JD-2026-001'], code)).toBe(false);
  });
});

describe('isReferralCodeConflict', () => {
  it('detects the unique-violation by code or constraint name', () => {
    expect(isReferralCodeConflict({ code: '23505', message: 'duplicate key' })).toBe(true);
    expect(isReferralCodeConflict({ message: 'duplicate key "Member_referralCode_uidx"' })).toBe(
      true,
    );
    expect(isReferralCodeConflict({ message: 'connection reset' })).toBe(false);
    expect(isReferralCodeConflict(null)).toBe(false);
  });
});
