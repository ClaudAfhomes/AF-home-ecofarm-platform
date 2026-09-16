import type { MemberStatus, Role } from '@jad/contracts';

/**
 * Mock session user. Mirrors the future `/auth/me` session resource shape
 * (PROPOSED - no SSOT field list yet). Never stored in browser storage; kept
 * in React context only (ARCH-DEC-007 session auth).
 *
 * `isQualified` is member eligibility (`members.is_qualified`, BR-QUAL-001) and
 * `status` is the member's membership status (BR-AUTH-002). Both apply to the
 * MEMBER role only - they are eligibility, not roles.
 */
export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isQualified?: boolean;
  status?: MemberStatus;
  /**
   * Admin-shell role id (exactly one role per staff user; system id or
   * custom role id). Resolved against role records via
   * `resolveRoleModules`. Absent for member principals and for sessions
   * whose role is not yet resolved (real backend resolves it server-side
   * later).
   */
  roleId?: string | null;
  /**
   * True while the account runs on a super-admin-set temporary password.
   * The holder must change it (My Account) before using the admin shell.
   */
  mustChangePassword?: boolean;
}

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';
