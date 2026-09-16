import { z } from 'zod';

/**
 * Policy - `GET /policies` (API-SPECIFICATION #69, PUBLIC, FEAT-062 / FR-ADM-004).
 * Admins manage policies, program guidelines, Terms and Conditions, and company
 * rules (FR-ADM-004). The `type` vocabulary is not enumerated in any SSOT, so it
 * is a free string. Shape is PROPOSED baseline.
 *
 * Policies carry a required PDF document (`documentUrl`, uploaded to the public
 * `marketing-tools` bucket via `POST /cms/upload/sign` + direct PUT) plus an
 * optional plain-text `content` summary (legacy/free-standing copy).
 */
export const policySchema = z.object({
  id: z.string().min(1),
  /**
   * Stable public URL key (`/policies/terms`, `/policies/privacy`) so footer
   * and consent links survive admin delete/recreate (ids change).
   */
  slug: z.string().min(1),
  title: z.string().min(1),
  type: z.string(),
  content: z.string().optional(),
  documentUrl: z.string().optional(),
  updatedAt: z.string(),
});

export type Policy = z.infer<typeof policySchema>;

/** Kebab-case slug rule shared by the API and the admin form. */
export const policySlugSchema = z
  .string()
  .trim()
  .min(1, 'Enter a URL slug.')
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens.');

/** `POST /policies` - admin policy create (FR-ADM-004). The PDF is required. */
export const policyCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: policySlugSchema,
  type: z.string().trim().min(1).max(60),
  content: z.string().max(20000).optional(),
  documentUrl: z.string().trim().min(1).url('A PDF upload is required.'),
});

export type PolicyCreateRequest = z.infer<typeof policyCreateSchema>;

/** `PUT /policies/:id` - admin policy update (FR-ADM-004). PDF cannot be unset. */
export const policyUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  slug: policySlugSchema.optional(),
  type: z.string().trim().min(1).max(60).optional(),
  content: z.string().max(20000).optional(),
  documentUrl: z.string().trim().min(1).url('A PDF upload is required.').optional(),
});

export type PolicyUpdateRequest = z.infer<typeof policyUpdateSchema>;
