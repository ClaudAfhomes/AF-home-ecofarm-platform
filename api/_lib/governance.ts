/**
 * Server-side RBAC governance guards (Phase B4). Mirrors
 * apps/admin/src/features/{roles,staff}/guards.ts so the API enforces what
 * the UI previews — frontend visibility is never authorization.
 */
export type GovRole = { id: string; permissions: string[] };
export type GovMember = { id: string; status: string; roleId: string };

export const GOVERNANCE_MODULES = ['staff', 'audit', 'config'] as const;

/** Governance modules this role is the sole granter of (excluding itself). */
export function soleGrantedGovernance(roles: readonly GovRole[], roleId: string): string[] {
  const current = roles.find((r) => r.id === roleId);
  if (!current) return [];
  return GOVERNANCE_MODULES.filter(
    (m) =>
      current.permissions.includes(m) &&
      !roles.some((r) => r.id !== roleId && r.permissions.includes(m)),
  );
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

/** Guard replacing a role's permission set. */
export function guardRolePermissions(
  roles: readonly GovRole[],
  roleId: string,
  next: string[],
  sessionRoleId?: string | null,
): GuardResult {
  const current = roles.find((r) => r.id === roleId);
  if (
    current &&
    sessionRoleId === roleId &&
    current.permissions.includes('staff') &&
    !next.includes('staff')
  ) {
    return {
      ok: false,
      reason:
        'You cannot remove your own governance access. Grant the Staff module to another role first.',
    };
  }
  const removed = soleGrantedGovernance(roles, roleId).filter((m) => !next.includes(m));
  if (removed.length > 0) {
    return {
      ok: false,
      reason: `Cannot revoke ${removed.join(', ')} — this is the last role granting ${removed.length === 1 ? 'it' : 'them'}. Grant ${removed.length === 1 ? 'it' : 'them'} to another role first.`,
    };
  }
  return { ok: true };
}

/** Guard deleting a role. Only super admins; no holders; governance survives. */
export function guardRoleDeleteServer(
  roles: readonly GovRole[],
  holderCount: number,
  role: GovRole & { isSystem: boolean },
  sessionRoleId?: string | null,
): GuardResult {
  if (sessionRoleId !== 'super_admin') {
    return { ok: false, reason: 'Only super admins can delete roles.' };
  }
  if (holderCount > 0) {
    return {
      ok: false,
      reason: `Cannot delete this role while ${holderCount} staff member${holderCount === 1 ? ' holds' : 's hold'} it. Reassign them first.`,
    };
  }
  const sole = soleGrantedGovernance(roles, role.id);
  if (sole.length > 0) {
    return {
      ok: false,
      reason: `Cannot delete this role — it is the last role granting ${sole.join(', ')}.`,
    };
  }
  return { ok: true };
}

/** Active governors: ACTIVE members in staff-granting roles, excluding one id. */
export function activeGovernorCount(
  members: GovMember[],
  roles: readonly GovRole[],
  excludeId?: string,
): number {
  const granting = new Set(roles.filter((r) => r.permissions.includes('staff')).map((r) => r.id));
  return members.filter(
    (m) => m.status === 'ACTIVE' && granting.has(m.roleId) && m.id !== excludeId,
  ).length;
}

export function isLastGovernor(
  members: GovMember[],
  roles: readonly GovRole[],
  target: GovMember,
): boolean {
  const granting = new Set(roles.filter((r) => r.permissions.includes('staff')).map((r) => r.id));
  return (
    target.status === 'ACTIVE' &&
    granting.has(target.roleId) &&
    activeGovernorCount(members, roles, target.id) === 0
  );
}
