import { z } from 'zod';

import { registrationSchema, rejectionNoteSchema } from '@jad/contracts';
import type { Registration, RejectionNote } from '@jad/contracts';

import { request, requestList } from '../../../lib/api/client';

/**
 * Registration repository — REST over api/v1 (Phase B3 cutover).
 * Centralizes state transitions: PENDING -> MEMBER (row deleted on approve),
 * PENDING -> REJECTED.
 */
export async function getRegistrations(): Promise<Registration[]> {
  return requestList('/admin/registrations', registrationSchema);
}

/**
 * Queue page fetch — same endpoint, but preserves `meta.invalid` (rows the
 * server dropped during validation) so the page can banner hidden work
 * instead of claiming "Queue is clear" while the dashboard card shows a
 * pending count. `meta` is passthrough in the contract; mocks and old
 * servers omit `invalid`, which defaults to 0.
 */
export async function getRegistrationsPage(): Promise<{
  registrations: Registration[];
  invalid: number;
}> {
  const { listResponseSchema } = await import('@jad/contracts');
  const { env } = await import('../../../lib/env');
  const { toApiError, ApiNetworkError, ApiParseError } = await import('../../../lib/api/errors');
  let res: Response;
  try {
    res = await fetch(`${env.VITE_API_BASE_URL}/admin/registrations`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    });
  } catch (cause) {
    throw new ApiNetworkError(cause);
  }
  const body: unknown = await res.text().then((text) => {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  });
  if (!res.ok) {
    throw toApiError(body, res.status);
  }
  const parsed = listResponseSchema(registrationSchema).safeParse(body);
  if (!parsed.success) {
    throw new ApiParseError('/admin/registrations', parsed.error.message);
  }
  const invalid =
    typeof parsed.data.meta?.invalid === 'number' && parsed.data.meta.invalid > 0
      ? Math.floor(parsed.data.meta.invalid)
      : 0;
  return { registrations: parsed.data.data, invalid };
}

export async function getRegistrationById(id: string): Promise<Registration | undefined> {
  try {
    return await request(`/admin/registrations/${id}`, registrationSchema);
  } catch {
    return undefined;
  }
}

const approveResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  memberId: z.string(),
});

export async function approveRegistration(
  id: string,
): Promise<{ id: string; status: string; memberId: string }> {
  return request(`/admin/registrations/${id}/approve`, approveResponseSchema, { method: 'POST' });
}

export async function rejectRegistration(id: string, note: RejectionNote): Promise<Registration> {
  return request(`/admin/registrations/${id}/reject`, registrationSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note),
  });
}

/**
 * Short-lived viewer URL for the applicant's ID document. Throws when no
 * file is on record (rows captured before file upload) — callers show the
 * "no file" state instead of a button.
 */
export async function getGovernmentIdUrl(id: string): Promise<string> {
  const { url } = await request(
    `/admin/registrations/${id}/government-id`,
    z.object({ url: z.string().min(1) }),
  );
  return url;
}

export { rejectionNoteSchema };
export type { RejectionNote };
