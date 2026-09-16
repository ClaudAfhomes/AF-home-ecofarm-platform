import { randomBytes } from 'node:crypto';

/**
 * Member referral-code generation (BR-REF-004).
 *
 * `Registration.referralCode` carries the *sponsor's* code supplied at
 * intake; `Member.referralCode` is the member's *own* auto-generated unique
 * code. These helpers keep the `JAD-<LAST5><SUFFIX>` shape used by existing
 * rows while giving the suffix real entropy (the previous
 * `Date.now().toString(36).slice(-2)` had ~36^2 collision space and no
 * uniqueness check, which caused `Member_referralCode_uidx` violations on
 * approve-with-referral-code).
 *
 * Pure functions - unit-tested, no Supabase import.
 */

/** Suffix alphabet: unambiguous uppercase alphanumerics (no 0/O/1/I). */
const SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUFFIX_LENGTH = 4;
export const MAX_REFERRAL_CODE_ATTEMPTS = 10;

function sanitizePrefix(lastName: string | null | undefined): string {
  const cleaned = String(lastName ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
  return cleaned || 'MEMBER';
}

function randomSuffix(): string {
  const bytes = randomBytes(SUFFIX_LENGTH);
  let out = '';
  for (const byte of bytes) {
    out += SUFFIX_ALPHABET[(byte as number) % SUFFIX_ALPHABET.length];
  }
  return out;
}

/** Fresh candidate code, e.g. `JAD-DELAC7X2Q`. Canonical uppercase. */
export function generateReferralCode(lastName?: string | null): string {
  return `JAD-${sanitizePrefix(lastName)}${randomSuffix()}`;
}

/** Case-insensitive membership check (app compares codes case-insensitively). */
export function isReferralCodeTaken(
  existingCodes: (string | null | undefined)[],
  candidate: string,
): boolean {
  const wanted = candidate.toLowerCase();
  return existingCodes.some((code) => typeof code === 'string' && code.toLowerCase() === wanted);
}

/**
 * Pick a candidate absent (case-insensitively) from `existingCodes`.
 * Bounded retries; falls back to a numeric suffix so it always terminates
 * even under an adversarial RNG in tests.
 */
export function pickUniqueReferralCode(
  existingCodes: (string | null | undefined)[],
  lastName?: string | null,
  maxAttempts = MAX_REFERRAL_CODE_ATTEMPTS,
): string {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateReferralCode(lastName);
    if (!isReferralCodeTaken(existingCodes, candidate)) return candidate;
  }
  const prefix = sanitizePrefix(lastName);
  let n = 2;
  for (;;) {
    const candidate = `JAD-${prefix}${n}`;
    if (!isReferralCodeTaken(existingCodes, candidate)) return candidate;
    n += 1;
  }
}

/** True when a Supabase/Postgres error is the referral-code unique violation. */
export function isReferralCodeConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown };
  if (record.code === '23505') return true;
  return typeof record.message === 'string' && record.message.includes('Member_referralCode_uidx');
}
