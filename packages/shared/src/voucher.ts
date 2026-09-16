/**
 * Voucher expiry helpers - framework-free, shared between admin and member apps.
 *
 * Template carries the *rule* (fixed date, validity-days-from-issued, or both).
 * At issuance the server snapshots the concrete `expiresAt` onto the member
 * voucher. All validity checks read only that authoritative snapshot - never the
 * template rule.
 */

export type VoucherExpiryRule = {
  /** Fixed expiry date (ISO string). Takes precedence over validityDays. */
  expiresAt?: string;
  /** Days from issuance. Applied only when no fixed date is set. */
  validityDays?: number;
};

/**
 * Compute the authoritative `expiresAt` for a newly-issued member voucher.
 *
 * Precedence:
 * 1. Fixed `expiresAt` on the template (if valid date) - wins.
 * 2. `validityDays` from the template + issuedAt - used if > 0.
 * 3. `undefined` - no expiry.
 */
export function computeMemberExpiry(rule: VoucherExpiryRule, issuedAt: Date): string | undefined {
  // 1. Fixed date takes precedence
  if (rule.expiresAt) {
    const d = new Date(rule.expiresAt);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // 2. Validity days from issuance
  if (typeof rule.validityDays === 'number' && rule.validityDays > 0) {
    const ms = issuedAt.getTime() + rule.validityDays * 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString();
  }

  // 3. No expiry
  return undefined;
}

/**
 * Is a member voucher expired?
 * Reads only the voucher's own `expiresAt` - the authoritative snapshot.
 * Missing / invalid date = not expired (safe fallback).
 */
export function isExpired(expiresAt?: string, now = new Date()): boolean {
  if (!expiresAt) return false;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return false;
  return now > d;
}
