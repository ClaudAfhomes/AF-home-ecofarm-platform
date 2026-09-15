import { programSchema, systemConfigEntrySchema } from '@jad/contracts';
import type { Program, SystemConfigEntry } from '@jad/contracts';

import { request, requestList } from '../../../lib/api/client';

/** GET /admin/config — full parameter list (mock server serves fixtures in dev/test). */
export function getConfig(): Promise<SystemConfigEntry[]> {
  return requestList('/admin/config', systemConfigEntrySchema);
}

/** GET /programs — shared program list (mock server serves fixtures in dev/test). */
export function getPrograms(): Promise<Program[]> {
  return requestList('/programs', programSchema);
}

/** PATCH /admin/config/:key — super_admin-only parameter update (audited server-side). */
export function updateConfig(key: string, value: string): Promise<SystemConfigEntry> {
  return request(`/admin/config/${encodeURIComponent(key)}`, systemConfigEntrySchema, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });
}
