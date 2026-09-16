import { z } from 'zod';

import { memberProfileSchema } from './member.js';
import { accountStatusSchema } from './registration.js';

/**
 * Admin dashboard queue counts — PROPOSED baseline (UI-UX §4.1 "Dashboard
 * (queues)"). Counts of actionable pending items for the documented queues
 * (Registrations, Sales, Withdrawals) plus the total non-archived member
 * count. Mock-only for F0; replaced by the real admin queue endpoints. Counts
 * are server facts, never derived client-side.
 */
export const adminQueuesSchema = z.object({
  registrations: z.number().int().nonnegative(),
  sales: z.number().int().nonnegative(),
  members: z.number().int().nonnegative(),
  withdrawals: z.number().int().nonnegative(),
});

export type AdminQueues = z.infer<typeof adminQueuesSchema>;

/**
 * Admin member view — member profile plus back-office lifecycle fields.
 * Served by `GET /admin/members[/:id]`; `registrationId` is absent for
 * directly-created members.
 */
export const adminMemberSchema = memberProfileSchema.extend({
  accountStatus: accountStatusSchema,
  registeredAt: z.string(),
  registrationId: z.string().optional(),
});

export type AdminMember = z.infer<typeof adminMemberSchema>;
