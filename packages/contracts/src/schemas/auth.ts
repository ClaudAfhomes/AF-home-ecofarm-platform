import { z } from 'zod';

import { memberStatusSchema } from './member.js';
import { roleSchema } from './role.js';

/**
 * Session principal — `GET /auth/me` + `POST /auth/login` (API-SPECIFICATION
 * #3/#6, FR-AUTH-004). No SSOT defines the exact session field list yet; this
 * is the PROPOSED baseline carried by the mock session (ARCH-DEC-007:
 * HttpOnly-cookie session; the client never stores credentials or tokens).
 *
 * `isQualified` is member eligibility (`members.is_qualified`, BR-QUAL-001) and
 * `status` is the member's membership status (BR-AUTH-002). Both apply to the
 * MEMBER role only — they are eligibility, not roles.
 */
export const sessionUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
  isQualified: z.boolean().optional(),
  status: memberStatusSchema.optional(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

/** `POST /auth/login` request — identifier accepts email or phone (FR-AUTH-004). */
export const loginRequestSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** `POST /auth/login` response — the established session principal. */
export const loginResponseSchema = z.object({
  user: sessionUserSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** One captured qualification answer (FR-REG-003; question content TBD OD-002). */
export const qualificationAnswerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().min(1),
});

export type QualificationAnswer = z.infer<typeof qualificationAnswerSchema>;

/**
 * Government ID submission — captured at registration (FR-REG-002, FEAT-010).
 * `data` carries transient base64 file bytes on submit only (never persisted,
 * never returned by readers — stripped server-side before storage).
 * `storagePath` is the private-bucket key set server-side after upload.
 */
export const idDocumentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  storagePath: z.string().min(1).optional(),
  data: z.string().min(1).optional(),
});

export type IdDocument = z.infer<typeof idDocumentSchema>;

/**
 * `POST /auth/register` request (API-SPECIFICATION #1, FEAT-007, FR-REG-001..013).
 * Program choice + profile + qualification answers + optional referral code +
 * ID document + email/password. Purchase is NOT required (BR-REG-006).
 */
export const registerRequestSchema = z.object({
  programId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleInitial: z.string().max(1).optional(),
  nameSuffix: z.string().optional(),
  dateOfBirth: z.string().min(1),
  gender: z.string().min(1),
  countryCode: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  referralCode: z.string().optional(),
  qualificationAnswers: z.array(qualificationAnswerSchema),
  idDocument: idDocumentSchema,
  verificationId: z.string().uuid().optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/**
 * Registration application resource (SCR-AUTH-004). No SSOT defines the exact
 * application field list; `emailVerified` reflects BR-AUTH-001 (email
 * verification precedes approval). Status vocabulary is BR-AUTH-002.
 */
export const registrationApplicationSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  status: memberStatusSchema,
  emailVerified: z.boolean(),
  createdAt: z.string(),
});

export type RegistrationApplication = z.infer<typeof registrationApplicationSchema>;

/** `POST /auth/register` response — application created in `Pending`. */
export const registerResponseSchema = z.object({
  application: registrationApplicationSchema,
});

export type RegisterResponse = z.infer<typeof registerResponseSchema>;

/** `POST /auth/verify-email` request — one-time verification code (FEAT-009). */
export const verifyEmailRequestSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
});

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

/** `POST /auth/verify-email/resend` request — re-issue the one-time code (FEAT-009). */
export const resendVerificationRequestSchema = z.object({
  email: z.string().email(),
});

export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;

/** `POST /auth/verify-email` response — email now verified (BR-AUTH-001). */
export const verifyEmailResponseSchema = z.object({
  email: z.string().email(),
  verifiedAt: z.string(),
});

export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;

/**
 * `POST /auth/verify-email/resend` response — MOCK-ONLY simulation. The real
 * API emails a code and returns no code; this mock surfaces the "email" the
 * applicant would receive so the frontend-only demo is usable. `devOnlyCode`
 * is never present in the real contract — consumers treat it as dev tooling.
 */
export const resendVerificationResponseSchema = z.object({
  email: z.string().email(),
  devOnlyCode: z.string().optional(),
});

export type ResendVerificationResponse = z.infer<typeof resendVerificationResponseSchema>;

/** `POST /me/resubmit` request — corrected registration data (FR-REG-005, #13). */
export const resubmitRequestSchema = registerRequestSchema.partial();

export type ResubmitRequest = z.infer<typeof resubmitRequestSchema>;
