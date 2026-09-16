import { z } from 'zod';

/**
 * System config entry - `GET /admin/config` (SUPER_ADMIN + ADMIN read,
 * SUPER_ADMIN write). One row per key in the `SystemConfig` table; `value`
 * is always transported as an exact string (numeric rates/amounts included)
 * and parsed by consumers per key. Mirrors `MockConfigEntry`.
 */
export const systemConfigEntrySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string(),
  category: z.string().min(1),
});

export type SystemConfigEntry = z.infer<typeof systemConfigEntrySchema>;

/** Keys the public config surface (`GET /config/public`) is derived from. */
export const PUBLIC_CONFIG_KEYS = ['QUALIFICATION_MIN_AGE', 'GENDERS'] as const;
