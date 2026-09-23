import type { RoleSlug } from './database.types';

export const SALES_ROLES = new Set<RoleSlug>([
  'vice_director',
  'senior_sales_manager',
  'sales_manager',
  'ost',
]);

export function canManageStaff(role: RoleSlug | null) {
  return role === 'super_admin';
}

export function allowedParentRoles(role?: RoleSlug) {
  if (role === 'senior_sales_manager') return new Set<RoleSlug>(['vice_director']);
  if (role === 'sales_manager') return new Set<RoleSlug>(['vice_director', 'senior_sales_manager']);
  if (role === 'ost') return new Set<RoleSlug>(['sales_manager']);
  return new Set<RoleSlug>();
}

export function isPlacementAllowed(input: {
  memberId: string;
  role: RoleSlug;
  parentId: string | null;
  parentRole?: RoleSlug;
  descendantIds?: ReadonlySet<string>;
}) {
  if (input.role === 'vice_director') return input.parentId === null;
  if (!SALES_ROLES.has(input.role)) return input.parentId === null;
  if (!input.parentId || input.parentId === input.memberId || input.descendantIds?.has(input.parentId)) return false;
  return allowedParentRoles(input.role).has(input.parentRole as RoleSlug);
}

export function canViewGenealogy(viewer: { id: string; role: RoleSlug }, member: { id: string; viceDirectorId: string | null }) {
  return viewer.role === 'super_admin' || member.id === viewer.id || member.viceDirectorId === viewer.id;
}

export function permittedModules(role: RoleSlug) {
  if (role === 'super_admin') return new Set(['users', 'departments', 'finance', 'hr', 'genealogy']);
  if (role === 'finance') return new Set(['finance']);
  if (role === 'hr') return new Set(['hr']);
  if (role === 'vice_director') return new Set(['genealogy']);
  return new Set<string>();
}
