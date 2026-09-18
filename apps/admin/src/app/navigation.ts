import type { Role, RoleRecord, StaffModule } from '@jad/contracts';
import { resolveRoleModules } from '@jad/contracts';
import type { SidebarItem } from '@jad/ui';

/**
 * Admin navigation registry (UI-UX §4.2 destinations). Categories group related
 * navlinks under a labeled header with a dropdown arrow. Each top-level
 * sidebar link has a unique icon; sub-items share the category visual style.
 * The mock session drives which items render, and the same registry guards
 * route access (RequireRole).
 * PROPOSED paths - no SSOT defines admin route paths yet.
 */
/** Dropdown sub-item with its own module for per-link RBAC filtering. */
export interface AdminNavSubItem {
  to: string;
  label: string;
  end?: boolean;
  module: StaffModule;
}

/** Structural match of the ui `SidebarDivider` (renders as a horizontal rule). */
export interface AdminNavDivider {
  divider: true;
}

export type AdminNavDropdownItem = AdminNavSubItem | AdminNavDivider;

export interface AdminNavItem extends SidebarItem {
  roles: Role[];
  /** RBAC module for this destination (single source: STAFF_PERMISSIONS matrix). */
  module: StaffModule;
  /** Optional dropdown sub-items when the item is a category header. */
  dropdown?: AdminNavDropdownItem[];
}

/** Phase 1 fresh-start: admin role only (user → no admin nav). Legacy SUPER_ADMIN maps to admin via normalizeRole. */
const ALL_STAFF: Role[] = ['admin'];
const ADMINS_ONLY: Role[] = ['admin'];

/**
 * Categorized admin navigation items. Each top-level entry is either a
 * single-page link or a category with a dropdown of sub-items. Every
 * top-level link receives a unique icon from the @jad/ui icon set.
 */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  /* Single-page link */
  {
    to: '/admin',
    label: 'Dashboard',
    icon: 'grid',
    end: true,
    roles: ALL_STAFF,
    module: 'dashboard',
  },

  /* Category: Members - Registration + Members as dropdown */
  {
    to: '/admin/members',
    label: 'Members',
    icon: 'users',
    roles: ADMINS_ONLY,
    module: 'members',
    dropdown: [
      { to: '/admin/registrations', label: 'Registration', module: 'registrations' },
      { to: '/admin/members', label: 'Members', module: 'members' },
    ],
  },

  /* Category: Operations (dropdown) */
  {
    to: '/admin/sales',
    label: 'Operations',
    icon: 'wallet',
    roles: ALL_STAFF,
    module: 'sales',
    dropdown: [
      { to: '/admin/sales', label: 'Sales', module: 'sales' },
      { to: '/admin/payouts', label: 'Payouts', module: 'payouts' },
      { to: '/admin/withdrawals', label: 'Withdrawals', module: 'withdrawals' },
      { to: '/admin/vouchers', label: 'Vouchers', module: 'vouchers' },
    ],
  },

  /* Flat: Properties - transactional catalog + Content as top-level links (no dropdown) */
  {
    to: '/admin/properties',
    label: 'Properties',
    icon: 'home',
    roles: ADMINS_ONLY,
    module: 'properties',
  },
  {
    to: '/admin/marketing-tools',
    label: 'Marketing Tools',
    icon: 'image',
    roles: ADMINS_ONLY,
    module: 'marketing_tools',
  },
  {
    to: '/admin/broadcasts',
    label: 'Broadcasts',
    icon: 'bell',
    roles: ADMINS_ONLY,
    module: 'marketing_tools',
  },
  {
    to: '/admin/messages',
    label: 'Messages',
    icon: 'message',
    roles: ADMINS_ONLY,
    module: 'messages',
  },
  {
    to: '/admin/policies',
    label: 'Policies',
    icon: 'file-text',
    roles: ADMINS_ONLY,
    module: 'policies',
  },

  /* Category: System (dropdown) */
  {
    to: '/admin/config',
    label: 'System',
    icon: 'gear',
    roles: ['admin'],
    module: 'config',
    dropdown: [
      { to: '/admin/config', label: 'System Configuration', module: 'config' },
      { to: '/admin/audit', label: 'Audit Log', module: 'audit' },
      { to: '/admin/staff', label: 'Staff', module: 'staff' },
      { to: '/admin/roles', label: 'Roles', module: 'staff' },
    ],
  },

  /* Category: Website CMS (Phase 1: Homepage, Phase 2: About, Phase 3: Properties, Phase 4: FAQs) */
  {
    to: '/admin/cms',
    label: 'Website CMS',
    icon: 'list',
    roles: ADMINS_ONLY,
    module: 'cms',
    dropdown: [
      { to: '/admin/cms/homepage', label: 'Homepage', module: 'cms' },
      { to: '/admin/cms/about', label: 'About', module: 'cms' },
      { to: '/admin/cms/properties', label: 'Properties', module: 'cms' },
      { to: '/admin/cms/faqs', label: 'FAQs', module: 'cms' },
      { to: '/admin/cms/contact', label: 'Contact', module: 'cms' },
      { to: '/admin/inquiries', label: 'Inquiries', module: 'cms' },
      { to: '/admin/cms/global', label: 'Global Content', module: 'cms' },
      { divider: true },
      { to: '/admin/cms/login', label: 'Login', module: 'cms' },
      { to: '/admin/cms/register', label: 'Register', module: 'cms' },
    ],
  },
];

export const ROLE_LABELS: Record<Role, string> = {
  user: 'User',
  admin: 'Admin',
};

/** Find the nav item whose `to` matches the given pathname (supports nested detail routes). */
export function findNavItem(pathname: string): AdminNavItem | undefined {
  const exact = ADMIN_NAV_ITEMS.find((item) => item.to === pathname);
  if (exact) return exact;
  // Check dropdown children first for more specific match
  for (const item of ADMIN_NAV_ITEMS) {
    if (
      item.dropdown?.some(
        (sub) => !('divider' in sub) && (pathname === sub.to || pathname.startsWith(`${sub.to}/`)),
      )
    ) {
      return item;
    }
    if (pathname.startsWith(`${item.to}/`) && item.to !== '/admin') {
      return item;
    }
  }
  return undefined;
}

/** Find the specific sub-item matching a pathname (for breadcrumb detail labels). */
export function findNavSubItem(
  pathname: string,
): { parent: AdminNavItem; sub: AdminNavSubItem } | undefined {
  for (const item of ADMIN_NAV_ITEMS) {
    const sub = item.dropdown?.find(
      (s) => !('divider' in s) && (pathname === s.to || pathname.startsWith(`${s.to}/`)),
    );
    if (sub && !('divider' in sub)) return { parent: item, sub };
  }
  return undefined;
}

/** Check whether a role can access a nav item (includes categories). */
export function canAccess(role: Role | null, item: AdminNavItem): boolean {
  return role !== null && item.roles.includes(role);
}

/**
 * Check whether a role id can access a nav item's module (records + matrix
 * fallback). `sessionModules` - when provided by the server-resolved
 * session - is authoritative and wins over records (see resolveRoleModules).
 */
export function canAccessModule(
  roleId: string | null,
  roles: readonly RoleRecord[] | undefined,
  item: AdminNavItem,
  sessionModules?: readonly StaffModule[],
): boolean {
  if (roleId === null) return false;
  return resolveRoleModules(roles, roleId, sessionModules).includes(item.module);
}

/** Check whether a role id can access a dropdown sub-item's module. */
export function canAccessSubModule(
  roleId: string | null,
  roles: readonly RoleRecord[] | undefined,
  sub: AdminNavSubItem,
  sessionModules?: readonly StaffModule[],
): boolean {
  if (roleId === null) return false;
  return resolveRoleModules(roles, roleId, sessionModules).includes(sub.module);
}

/**
 * Filter a dropdown to the sub-items visible to a role id, dropping
 * dividers left orphaned at the edges or doubled up by the filtering.
 */
export function filterDropdownForStaffRole(
  dropdown: AdminNavDropdownItem[] | undefined,
  roleId: string | null,
  roles?: readonly RoleRecord[],
  sessionModules?: readonly StaffModule[],
): AdminNavDropdownItem[] | undefined {
  if (!dropdown) return undefined;
  if (roleId === null) return dropdown;
  const visible = dropdown.filter(
    (sub) => 'divider' in sub || canAccessSubModule(roleId, roles, sub, sessionModules),
  );
  const cleaned: AdminNavDropdownItem[] = [];
  for (const sub of visible) {
    const prev = cleaned[cleaned.length - 1];
    if ('divider' in sub && (prev === undefined || 'divider' in prev)) continue;
    cleaned.push(sub);
  }
  while (cleaned.length > 0 && 'divider' in cleaned[cleaned.length - 1]!) cleaned.pop();
  return cleaned;
}

/** Extract SidebarItem list, preserving dropdown metadata for the renderer. */
export function navItemsForRole(
  role: Role | null,
  roleId?: string | null,
  roles?: readonly RoleRecord[],
  sessionModules?: readonly StaffModule[],
): SidebarItem[] {
  if (role === null) return [];
  const items = ADMIN_NAV_ITEMS.filter((item) => canAccess(role, item));
  if (roleId === undefined) {
    return items.map((item) => ({
      to: item.to,
      label: item.label,
      icon: item.icon,
      end: item.end,
      badge: item.badge,
      /** Pass through dropdown so the Sidebar can render a category header. */
      dropdown: item.dropdown,
    }));
  }
  if (roleId === null) return [];
  return items.flatMap((item) => {
    const dropdown = filterDropdownForStaffRole(item.dropdown, roleId, roles, sessionModules);
    // A category stays visible when its own module is allowed or when at
    // least one sub-item link remains (e.g. merchant sees Operations for
    // Vouchers even though the Operations/Sales module itself is denied).
    const hasVisibleLink = dropdown?.some((sub) => !('divider' in sub)) ?? false;
    if (!canAccessModule(roleId, roles, item, sessionModules) && !hasVisibleLink) return [];
    return [
      {
        to: item.to,
        label: item.label,
        icon: item.icon,
        end: item.end,
        badge: item.badge,
        dropdown,
      },
    ];
  });
}
