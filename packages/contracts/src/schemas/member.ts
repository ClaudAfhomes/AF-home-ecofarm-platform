import { z } from 'zod';

/**
 * Member account status - CONFIRMED by BR-AUTH-002 / DATABASE-DESIGN §members
 * (one row per member account across registration attempts; never hard-deleted).
 * Registrations surface the same status lifecycle.
 */
export const memberStatusSchema = z.enum(['PENDING', 'APPROVED_ACTIVE', 'REJECTED']);

export type MemberStatus = z.infer<typeof memberStatusSchema>;

/**
 * Member account (registration queue item) - PROPOSED baseline. No SSOT defines
 * the API field list for a member/registration resource yet; `registeredAt` is
 * the account creation timestamp (ISO-8601). Replaced by the real contract when
 * the member API lands - the schema is the single client-side validation point.
 */
export const memberAccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  status: memberStatusSchema,
  registeredAt: z.string(),
});

export type MemberAccount = z.infer<typeof memberAccountSchema>;

/** A program reference carried on the member profile (`programs`, BR-PRG-001). */
export const programRefSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
});

export type ProgramRef = z.infer<typeof programRefSchema>;

/**
 * Member profile - `GET /members/:id` (MEM own) / `PATCH /me` (API-SPECIFICATION
 * #8/#9, FR-MEM-001). Fields follow `members` (DATABASE-DESIGN §7.2). Only the
 * member's OWN profile is ever rendered (object-level, NFR-AUTHZ-002). Country
 * is immutable (BR-REG-010) and rendered read-only. Money/exact fields: none.
 */
export const memberProfileSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleInitial: z.string().max(1).optional(),
  nameSuffix: z.string().optional(),
  dateOfBirth: z.string().min(1),
  age: z.number().int().nonnegative(),
  gender: z.string().min(1),
  address: z.string().optional(),
  countryCode: z.string().min(1),
  countryName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  referralCode: z.string().min(1),
  status: memberStatusSchema,
  isQualified: z.boolean(),
  program: programRefSchema,
});

export type MemberProfile = z.infer<typeof memberProfileSchema>;

/** `PATCH /me` - mutable profile fields; country is never editable (BR-REG-010). */
export const updateProfileRequestSchema = memberProfileSchema.pick({
  firstName: true,
  lastName: true,
  middleInitial: true,
  nameSuffix: true,
  gender: true,
  address: true,
  phone: true,
});

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

/**
 * Qualification requirement checklist - `GET /me/qualification` (API-SPECIFICATION
 * #15, FR-REG-008, BR-QUAL-001). Server-authoritative: the UI renders exactly
 * what the API returns and never derives Active + Qualified client-side.
 */
export const qualificationRequirementSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  met: z.boolean(),
  detail: z.string().optional(),
});

export type QualificationRequirement = z.infer<typeof qualificationRequirementSchema>;

export const qualificationSummarySchema = z.object({
  status: memberStatusSchema,
  isQualified: z.boolean(),
  requirements: z.array(qualificationRequirementSchema),
  rejectionReason: z.string().optional(),
});

export type QualificationSummary = z.infer<typeof qualificationSummarySchema>;

/** `GET /me/referral-code` (API-SPECIFICATION #14, FR-REF-001; immutable BR-REF-004). */
export const referralCodeSchema = z.object({
  code: z.string().min(1),
});

export type ReferralCode = z.infer<typeof referralCodeSchema>;

/**
 * Permanent member purge - `DELETE /admin/members/:id` (super_admin only,
 * owner-approved exception to the archive-only default). The reason is
 * mandatory and written to `AuditLog` (MEMBER_PURGED). Archive via
 * `POST /admin/members/:id/archive` remains the default lifecycle.
 */
export const purgeMemberRequestSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required to permanently delete a member.'),
});

export type PurgeMemberRequest = z.infer<typeof purgeMemberRequestSchema>;

/** Success payload for `DELETE /admin/members/:id`. */
export const purgeMemberResponseSchema = z.object({
  purgedId: z.string().min(1),
  /** False when the auth identity survived (retry exhausted) - caller must warn. */
  authRemoved: z.boolean(),
});

export type PurgeMemberResponse = z.infer<typeof purgeMemberResponseSchema>;
