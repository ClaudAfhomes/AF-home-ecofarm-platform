import { z } from 'zod';

import { idDocumentSchema, qualificationAnswerSchema } from './auth.js';
import { memberProfileSchema } from './member.js';

/**
 * Rejection note - structured per Business Flow (BR-REG-004).
 * `reason` = why rejected, `requiredChanges` = what applicant must edit/correct.
 * Kept structured, not a single unstructured string.
 */
export const rejectionNoteSchema = z.object({
  reason: z.string().min(1),
  requiredChanges: z.string().min(1),
});

export type RejectionNote = z.infer<typeof rejectionNoteSchema>;

/**
 * Registration lifecycle statuses - PENDING | REJECTED only. Approval moves
 * the application to the Member domain (the Registration row is deleted on
 * approve), so APPROVED_ACTIVE never lives in Registration.
 */
export const registrationStatusSchema = z.enum(['PENDING', 'REJECTED']);

export type RegistrationStatus = z.infer<typeof registrationStatusSchema>;

/**
 * Canonical mock registration entity - database-ready, ID + ISO country, no display-name duplication.
 * Governed by BR-AUTH-002 / BR-REG-004 / BR-REG-010.
 */
export const registrationSchema = z.object({
  id: z.string().min(1),
  status: registrationStatusSchema,
  firstName: z.string().min(1),
  middleInitial: z.string().max(1).optional(),
  lastName: z.string().min(1),
  nameSuffix: z.string().optional(),
  /** Applicant email (B8+ intake). Absent on legacy rows. */
  email: z.string().email().optional(),
  phone: z.string().min(1),
  dateOfBirth: z.string().min(1),
  gender: z.string().min(1),
  countryCode: z.string().length(2),
  countryName: z.string().min(1),
  address: z.string().optional(),
  programId: z.string().min(1),
  programCode: z.string().min(1),
  referralCode: z.string().optional(),
  qualificationAnswers: z.array(qualificationAnswerSchema),
  // Nullable in the DB (legacy rows and no-file captures); optional keeps the
  // wire contract aligned with reality instead of hiding such rows.
  governmentId: idDocumentSchema.optional(),
  submittedAt: z.string(),
  reviewedAt: z.string().optional(),
  reviewedBy: z.string().optional(),
  rejectionNote: rejectionNoteSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Registration = z.infer<typeof registrationSchema>;

/**
 * Account status for member lifecycle - ACTIVE / INACTIVE.
 * Distinct from membership status (PENDING/APPROVED_ACTIVE/REJECTED).
 * Deactivation MUST NOT delete (BR-LED/BI-005).
 */
export const accountStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

/**
 * Archived member record - preserves original member + audit trail.
 * Never hard-delete (Delete = Archive). The snapshot is the member row
 * itself (archive snapshots members); a registration-shaped snapshot is
 * accepted for legacy rows.
 */
export const archivedMemberSchema = z.object({
  id: z.string().min(1),
  memberId: z.string().min(1),
  originalData: z.union([registrationSchema, memberProfileSchema]),
  archivedAt: z.string(),
  archivedBy: z.string().min(1),
  previousStatus: z.string().min(1),
  previousAccountStatus: accountStatusSchema.optional(),
});

export type ArchivedMember = z.infer<typeof archivedMemberSchema>;
