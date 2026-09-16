import { z } from 'zod';

import { memberStatusSchema } from './member.js';
import type { MemberStatus } from './member.js';

/**
 * Direct Referral - `GET /me/direct-referrals` (API-SPECIFICATION #22/#74,
 * FEAT-064, FR-RPT-001). Single-level only (BR-REF-001/002): the member's own
 * direct referrals. Shape is PROPOSED - no SSOT defines the field list yet.
 * `status` uses the confirmed member status vocabulary (BR-AUTH-002).
 */
export const directReferralSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: memberStatusSchema,
  isQualified: z.boolean(),
  joinedAt: z.string(),
});

export type DirectReferral = z.infer<typeof directReferralSchema>;

/**
 * Group Network summary - `GET /me/reports/group-network` (API-SPECIFICATION
 * #75, FEAT-065, FR-RPT-002). Reporting/network concept ONLY - never implies
 * multi-level commission entitlement (BI-004, BR-RPT-002). Counts come from the
 * server; the client never derives them. Shape is PROPOSED.
 */
export const groupNetworkSchema = z.object({
  totalMembers: z.number().int().nonnegative(),
  directReferrals: z.number().int().nonnegative(),
  qualified: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
});

export type GroupNetwork = z.infer<typeof groupNetworkSchema>;

/**
 * Genealogy tree node - `GET /me/genealogy` (API-SPECIFICATION #77, FEAT-067,
 * FR-RPT-004). Visualizes referral relationships ONLY; never implies or computes
 * multi-level direct referral commissions (BI-004, BR-RPT-004). `children` are
 * the node's own direct referrals (recursive tree). Shape is PROPOSED.
 */
export interface GenealogyNodeShape {
  id: string;
  name: string;
  status: MemberStatus;
  isQualified: boolean;
  joinedAt: string;
  children: GenealogyNodeShape[];
}

export const genealogyNodeSchema: z.ZodType<GenealogyNodeShape> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    status: memberStatusSchema,
    isQualified: z.boolean(),
    joinedAt: z.string(),
    children: z.array(genealogyNodeSchema),
  }),
);

export const genealogySchema = z.object({
  root: genealogyNodeSchema,
  /**
   * Direct sponsor (the member who referred this member), when one is linked.
   * Null for members with no sponsor (e.g. the network root or admin-created
   * members) - BR-REF-003.
   */
  sponsor: genealogyNodeSchema.nullable(),
  /**
   * Upline chain - from the topmost reachable ancestor down to the direct
   * sponsor, excluding the member itself. Empty when the member has no
   * sponsor. Reporting only, never commission-entitlement (BI-004).
   */
  ancestors: z.array(genealogyNodeSchema),
});

export type GenealogyNode = z.infer<typeof genealogyNodeSchema>;
export type Genealogy = z.infer<typeof genealogySchema>;
