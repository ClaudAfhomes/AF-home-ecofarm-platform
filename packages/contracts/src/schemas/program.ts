import { z } from 'zod';

/**
 * Program - `GET /programs` (API-SPECIFICATION #78, PUBLIC, FEAT-068 / FR-PRG-001).
 * SSOT confirms two programs: Domestic (MVP) and Abroad. Program `code` values
 * are not enumerated in any SSOT, so `code` is a free string - never assume
 * `DOMESTIC`/`ABROAD` literal values. Shape is PROPOSED baseline.
 */
export const programSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

export type Program = z.infer<typeof programSchema>;

/**
 * Admin program DTO - `GET /admin/programs` (includes inactive programs so
 * staff can retire/reactivate them).
 */
export const programAdminSchema = programSchema.extend({
  isActive: z.boolean(),
});

export type ProgramAdmin = z.infer<typeof programAdminSchema>;

/** `POST /admin/programs` - super_admin program create (FR-PRG-001). */
export const programCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens, or underscores.'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

export type ProgramCreateRequest = z.infer<typeof programCreateSchema>;

/** `PATCH /admin/programs/:id` - super_admin program update/retire. */
export const programUpdateSchema = programCreateSchema.partial();

export type ProgramUpdateRequest = z.infer<typeof programUpdateSchema>;

/**
 * Qualification question - `GET /programs/:id/qualification-questions`
 * (API-SPECIFICATION #86 PROPOSED). Content is TBD (OD-002); the shape is the
 * PROPOSED baseline only. The mock serves placeholder questions.
 */
export const qualificationQuestionSchema = z.object({
  id: z.string().min(1),
  questionText: z.string().min(1),
});

export type QualificationQuestion = z.infer<typeof qualificationQuestionSchema>;
