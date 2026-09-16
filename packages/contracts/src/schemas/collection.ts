import { z } from 'zod';

/**
 * Collection envelope: `{ data, meta }` - CONFIRMED by API-SPECIFICATION.md §1.1/§4.
 * `meta` is passthrough to tolerate per-endpoint pagination fields (§4) without
 * inventing a fixed shape.
 */
export function listResponseSchema<T>(itemSchema: z.ZodType<T>) {
  return z.object({
    data: z.array(itemSchema),
    meta: z.record(z.string(), z.unknown()).optional(),
  });
}

export type ListResponse<T> = z.infer<ReturnType<typeof listResponseSchema<T>>>;
