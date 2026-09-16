import { z } from 'zod';

/**
 * Forwardable content kind - PROPOSED. Managed marketing material (BR-MKT-001).
 * The vocabulary is a free-string baseline (no SSOT enumeration); kept narrow so
 * the client can present each kind without inventing labels.
 */
export const contentKindSchema = z.enum(['DOCUMENT', 'IMAGE', 'VIDEO', 'PROMO']);

export type ContentKind = z.infer<typeof contentKindSchema>;

/**
 * Forwardable content - `GET /content/forwardable` (API-SPECIFICATION #68,
 * FEAT-061, FR-ADM-003, SCR-MEM-022). Members may forward permitted content via
 * Facebook Messenger and Viber and download permitted materials (BR-MKT-002).
 * Share/download URLs are SERVER-PROVIDED - the client never guesses external
 * URLs. All link rendering is declarative React with automatic escaping; no raw
 * HTML (SECURITY.md §security-design). Shape is PROPOSED.
 */
export const forwardableContentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  kind: contentKindSchema,
  /** Server-provided download target (present when downloadable, BR-MKT-002). */
  downloadUrl: z.string().optional(),
  /** Server-provided share targets - Messenger / Viber / copyable link. */
  share: z
    .object({
      messengerUrl: z.string().optional(),
      viberUrl: z.string().optional(),
      copyUrl: z.string().optional(),
    })
    .optional(),
  createdAt: z.string(),
});

export type ForwardableContent = z.infer<typeof forwardableContentSchema>;

/**
 * Create marketing content - `POST /admin/content` (FR-ADM-003).
 * The id/createdAt are server-generated; `published` defaults to true so
 * newly created content is immediately visible to members via
 * `GET /content/forwardable`. `share` may be omitted - the server fills
 * server-provided share targets from the download URL.
 */
export const createContentItemRequestSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional().or(z.literal('')),
  kind: contentKindSchema,
  downloadUrl: z.string().min(1),
  share: z
    .object({
      messengerUrl: z.string().optional(),
      viberUrl: z.string().optional(),
      copyUrl: z.string().optional(),
    })
    .optional(),
  published: z.boolean().optional(),
});

export type CreateContentItemRequest = z.infer<typeof createContentItemRequestSchema>;

/**
 * Update marketing content - `PATCH /admin/content/:id` (FR-ADM-003).
 * All-optional (partial) over the editable surface: title, description,
 * kind, downloadUrl. Empty patch is rejected by the handler ("Nothing to
 * update."). A new downloadUrl swaps the file: the server rebuilds
 * server-provided share targets and best-effort removes the superseded
 * bucket object. Explicit null detaches the file entirely (URL + share
 * cleared, old object removed best-effort). `share`/`published` stay
 * server-managed.
 */
export const updateContentItemRequestSchema = createContentItemRequestSchema
  .pick({ title: true, description: true, kind: true })
  .partial()
  .extend({
    // New file URL to swap in, or explicit null to detach the current file
    // (clears download_url + derived share targets; the old bucket object is
    // removed best-effort). Undefined = leave the file untouched.
    downloadUrl: z.string().min(1).nullable().optional(),
  });

export type UpdateContentItemRequest = z.infer<typeof updateContentItemRequestSchema>;

/**
 * Delete marketing content - `DELETE /admin/content/:id` (FR-ADM-003).
 * Removes the `ContentItem` row and, when the download URL points inside
 * the `marketing-tools` Storage bucket, the uploaded object as well.
 * `fileRemoved` is false when there was no bucket object to remove (external
 * URL) or the storage removal failed - the row delete still succeeds.
 */
export const deleteContentItemResponseSchema = z.object({
  id: z.string().min(1),
  deleted: z.literal(true),
  fileRemoved: z.boolean(),
});

export type DeleteContentItemResponse = z.infer<typeof deleteContentItemResponseSchema>;

/**
 * Signed-upload request - `POST /cms/upload/sign` (FR-ADM-003 upload step).
 * `kind` selects the allowlist + size cap; legacy CMS image callers omit it
 * and get the IMAGE rules (backward compatible).
 */
export const contentUploadSignRequestSchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  size: z.number().int().nonnegative().optional(),
  kind: contentKindSchema.optional(),
});

export type ContentUploadSignRequest = z.infer<typeof contentUploadSignRequestSchema>;
