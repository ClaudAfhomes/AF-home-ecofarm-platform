import { z } from 'zod';

/**
 * Public config parameters — `GET /config/public` (API-SPECIFICATION #81, PUBLIC).
 * Derives from FR-ADM-001 (Super Admin configures minimum age, gender values,
 * commission rates, clearing period, resubmission limits, redemption mode).
 *
 * Only the fields the public UI consumes are typed here. Exact server shape is
 * NOT yet defined in API-SPECIFICATION.md (no request/response example) — this
 * schema is the PROPOSED baseline and the typed client treats a mismatch as an
 * error state rather than silently coercing data.
 */
export const publicConfigSchema = z.object({
  minimumAge: z.number().int().nonnegative(),
  genders: z.array(z.string()).optional(),
  /**
   * Structured country reference (ISO 3166 — DATABASE-DESIGN §7.31). The
   * registration country is a structured, immutable value (BR-REG-010); the
   * config service supplies the option list (UI-UX §8.8).
   */
  countries: z.array(z.object({ code: z.string().min(1), name: z.string().min(1) })).optional(),
  /**
   * Withdrawal bounds (MIN/MAX_WITHDRAWAL_AMOUNT, exact-decimal strings).
   * Served so the member form can validate inline; the DB function
   * `withdraw_reserve` remains authoritative server-side.
   */
  withdrawalLimits: z.object({ min: z.string().min(1), max: z.string().min(1) }).optional(),
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;
