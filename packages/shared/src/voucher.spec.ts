import { describe, expect, it } from 'vitest';

import { computeMemberExpiry, isExpired } from './voucher.js';

describe('computeMemberExpiry', () => {
  const issuedAt = new Date('2026-08-20T10:00:00.000Z');

  it('returns undefined when no rule is set', () => {
    expect(computeMemberExpiry({}, issuedAt)).toBeUndefined();
  });

  it('returns undefined when validityDays is 0', () => {
    expect(computeMemberExpiry({ validityDays: 0 }, issuedAt)).toBeUndefined();
  });

  it('computes expiry from validityDays', () => {
    const result = computeMemberExpiry({ validityDays: 30 }, issuedAt);
    expect(result).toBe('2026-09-19T10:00:00.000Z');
  });

  it('computes expiry from fixed date', () => {
    const result = computeMemberExpiry({ expiresAt: '2026-12-31T00:00:00.000Z' }, issuedAt);
    expect(result).toBe('2026-12-31T00:00:00.000Z');
  });

  it('fixed date takes precedence over validityDays', () => {
    const result = computeMemberExpiry(
      { expiresAt: '2026-10-01T00:00:00.000Z', validityDays: 30 },
      issuedAt,
    );
    expect(result).toBe('2026-10-01T00:00:00.000Z');
  });

  it('falls back to validityDays when fixed date is invalid', () => {
    const result = computeMemberExpiry({ expiresAt: 'not-a-date', validityDays: 15 }, issuedAt);
    expect(result).toBe('2026-09-04T10:00:00.000Z');
  });

  it('returns undefined when fixed date is invalid and no validityDays', () => {
    expect(computeMemberExpiry({ expiresAt: 'not-a-date' }, issuedAt)).toBeUndefined();
  });
});

describe('isExpired', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');

  it('returns false when expiresAt is undefined', () => {
    expect(isExpired(undefined, now)).toBe(false);
  });

  it('returns false when expiresAt is empty string', () => {
    expect(isExpired('', now)).toBe(false);
  });

  it('returns false when expiresAt is invalid', () => {
    expect(isExpired('not-a-date', now)).toBe(false);
  });

  it('returns false when not yet expired', () => {
    expect(isExpired('2026-12-31T00:00:00.000Z', now)).toBe(false);
  });

  it('returns true when past expiry', () => {
    expect(isExpired('2026-08-01T00:00:00.000Z', now)).toBe(true);
  });

  it('returns true when exactly at expiry (edge)', () => {
    // now > expiresAt → true when equal? 12:00 > 12:00 is false
    expect(isExpired('2026-09-01T12:00:00.000Z', now)).toBe(false);
  });

  it('returns true when one second past', () => {
    expect(isExpired('2026-09-01T11:59:59.000Z', now)).toBe(true);
  });
});
