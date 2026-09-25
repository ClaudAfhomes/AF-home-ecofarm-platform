import {
  BadgeDollarSign, Boxes, Building2, ContactRound, CreditCard, FileBarChart,
  LayoutDashboard, Network, QrCode, Settings, ShieldCheck, ShoppingCart, UserCog, KeyRound,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { PERMISSIONS } from '../lib/permissions';
import type { RoleSlug } from '../lib/database.types';

export type NavigationItem = {
  to: string; label: string; icon: ComponentType<{ size?: number }>;
  permission: string; superAdminOnly?: boolean; roles?: RoleSlug[];
  badgeKeys?: Array<'paymentVerification' | 'cardActivation' | 'ostApplications'>;
};

export type NavigationGroup = {
  id: string; label: string; icon: ComponentType<{ size?: number }>;
  items: NavigationItem[]; standalone?: boolean;
};

// Only functional destinations are exposed. Future modules remain in the codebase
// and permission catalog, but do not become dead links in the production shell.
export const navigation: NavigationGroup[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, standalone: true,
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: PERMISSIONS.dashboard }] },
  { id: 'organization', label: 'Organization', icon: Building2, items: [
    { to: '/settings/users', label: 'Users & accounts', icon: UserCog, permission: PERMISSIONS.users },
    { to: '/settings/roles', label: 'Roles & permissions', icon: KeyRound, permission: PERMISSIONS.roleTemplates, superAdminOnly: true },
    { to: '/settings/departments', label: 'Departments', icon: Building2, permission: PERMISSIONS.departments, superAdminOnly: true },
  ] },
  { id: 'sales', label: 'Sales & Customers', icon: ShoppingCart, items: [
    { to: '/products', label: 'VIP card products', icon: Boxes, permission: PERMISSIONS.products },
    { to: '/customers', label: 'Customers', icon: ContactRound, permission: PERMISSIONS.customers },
    { to: '/sales', label: 'Sales records', icon: ShoppingCart, permission: PERMISSIONS.sales },
  ] },
  { id: 'finance', label: 'Finance', icon: CreditCard, items: [
    { to: '/finance', label: 'Payment & activation', icon: CreditCard, permission: PERMISSIONS.finance, badgeKeys: ['paymentVerification','cardActivation'] },
    { to: '/reports', label: 'Finance reports', icon: FileBarChart, permission: PERMISSIONS.reports },
  ] },
  { id: 'network', label: 'Network', icon: Network, items: [
    { to: '/vice-director', label: 'VD analytics', icon: BadgeDollarSign, permission: PERMISSIONS.genealogy },
    { to: '/genealogy/members', label: 'Genealogy', icon: Network, permission: PERMISSIONS.genealogy },
    { to: '/qr-credits', label: 'Referral QR credits', icon: QrCode, permission: PERMISSIONS.qrCredits },
    { to: '/ost/referrals', label: 'OST referral codes', icon: QrCode, permission: PERMISSIONS.dashboard, roles: ['sales_manager'] },
    { to: '/ost/applications', label: 'OST applications', icon: ContactRound, permission: PERMISSIONS.dashboard, roles: ['super_admin','admin','sales_manager'], badgeKeys: ['ostApplications'] },
  ] },
  { id: 'governance', label: 'CMS & Governance', icon: ShieldCheck, items: [
    { to: '/audit', label: 'Audit log', icon: ShieldCheck, permission: PERMISSIONS.audit },
    { to: '/settings', label: 'Business settings', icon: Settings, permission: PERMISSIONS.settings },
  ] },
];

export function visibleNavigation(groups: NavigationGroup[], permissions: Set<string>, role: RoleSlug | null) {
  return groups.map((group) => ({ ...group, items: group.items.filter((item) =>
    permissions.has(item.permission)
    && (!item.superAdminOnly || role === 'super_admin')
    && (!item.roles || (role !== null && item.roles.includes(role))),
  ) })).filter((group) => group.items.length > 0);
}

export type Breadcrumb = { label: string; to?: string };

export function breadcrumbItems(pathname: string, groups: NavigationGroup[]): Breadcrumb[] {
  if (pathname === '/') return [{ label: 'Dashboard' }];
  if (pathname === '/customers/new') return [{ label: 'Dashboard', to: '/' }, { label: 'Customers', to: '/customers' }, { label: 'Register customer' }];
  for (const group of groups) {
    for (const item of group.items) {
      const prefix = item.to !== '/' && pathname.startsWith(`${item.to}/`);
      if (pathname === item.to || prefix) {
        const parent = group.standalone ? [] : [{ label: group.label }];
        const current = prefix ? [{ label: item.label, to: item.to }, { label: 'Details' }] : [{ label: item.label }];
        return [{ label: 'Dashboard', to: '/' }, ...parent, ...current];
      }
    }
  }
  return [];
}
