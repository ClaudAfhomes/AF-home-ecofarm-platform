import {
  contactSubmissionResponseSchema,
  policySchema,
  programSchema,
  publicConfigSchema,
} from '@jad/contracts';
import type {
  ContactSubmissionRequest,
  ContactSubmissionResponse,
  Policy,
  Program,
  PublicConfig,
} from '@jad/contracts';

import { request, requestList } from './client';

/**
 * Feature services - feature-scoped wrappers over the typed client
 * (FRONTEND-ARCHITECTURE §5). Only PUBLIC endpoints are consumed here.
 */

/** GET /config/public - non-sensitive config parameters (API-SPECIFICATION #81, FEAT-005). */
export function getPublicConfig(): Promise<PublicConfig> {
  return request('/config/public', publicConfigSchema);
}

/** GET /programs - Domestic / Abroad program list, public (API-SPECIFICATION #78, FEAT-068). */
export function getPrograms(): Promise<Program[]> {
  return requestList('/programs', programSchema);
}

/** GET /policies - policies, guidelines, T&C (API-SPECIFICATION #69, FEAT-062). */
export function getPolicies(): Promise<Policy[]> {
  return requestList('/policies', policySchema);
}

/** POST /contact - public contact form submission. */
export function submitContact(input: ContactSubmissionRequest): Promise<ContactSubmissionResponse> {
  return request('/contact', contactSubmissionResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
