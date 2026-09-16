import { z } from 'zod';

import { exactDecimalStringSchema } from './money.js';

/**
 * Catalog - transactional system-of-record (BR-PRP-001..004, FEAT-025/026).
 * Catalog owns: ID, category, price, status. CMS owns presentation
 * (descriptions, highlights, gallery, merchandising) but both reference the
 * same property ID. This gives a cleaner future DB model than treating
 * cms_contents as the transactional source.
 *
 * Future DB: `properties(id PK slug, category_id FK, price numeric, status)`
 * and `property_categories(slug PK)`; sales snapshot `propertyValue` via BI-006.
 */

export const catalogPropertyStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export type CatalogPropertyStatus = z.infer<typeof catalogPropertyStatusSchema>;

export const catalogPropertySchema = z.object({
  id: z
    .string()
    .min(1, 'ID is required')
    .max(60, 'ID must be 60 characters or less')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  categoryId: z
    .string()
    .min(1, 'Category is required')
    .max(60, 'Category must be 60 characters or less'),
  price: exactDecimalStringSchema.optional(),
  status: catalogPropertyStatusSchema,
});

export type CatalogProperty = z.infer<typeof catalogPropertySchema>;

/** `POST /admin/properties` - id is server-generated. */
export const createPropertyRequestSchema = catalogPropertySchema.omit({ id: true });

export type CreatePropertyRequest = z.infer<typeof createPropertyRequestSchema>;

/** `PATCH /admin/properties/:id` - partial edits. */
export const updatePropertyRequestSchema = catalogPropertySchema.omit({ id: true }).partial();

export type UpdatePropertyRequest = z.infer<typeof updatePropertyRequestSchema>;
