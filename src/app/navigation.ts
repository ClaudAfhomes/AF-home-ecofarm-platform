import {
  Activity,
  BadgeDollarSign,
  Bell,
  Boxes,
  Building2,
  ContactRound,
  CreditCard,
  FileBarChart,
  LayoutDashboard,
  Network,
  QrCode,
  Settings,
  ShieldCheck,
  ShoppingCart,
  UserCog,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { PERMISSIONS } from '../lib/permissions';
import type { RoleSlug } from '../lib/database.types';

export type NavigationItem = {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  permission: string;
  superAdminOnly?: boolean;
};

export type NavigationGroup = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  items: NavigationItem[];
};

export const navigation: NavigationGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    items: [{ to: '/', label: 'Overview', icon: LayoutDashboard, permission: PERMISSIONS.dashboard }],
  },
  {
    id: 'organization',
    label: 'Organization',
    icon: Building2,
    items: [
      { to: '/settings/users', label: 'Users & roles', icon: UserCog, permission: PERMISSIONS.users, superAdminOnly: true },
      { to: '/settings/departments', label: 'Departments', icon: Building2, permission: PERMISSIONS.departments, superAdminOnly: true },
      { to: '/employees', label: 'HR employees', icon: Users, permission: PERMISSIONS.hr },
    ],
  },
  {
    id: 'sales',
    label: 'Sales & Customers',
    icon: ShoppingCart,
    items: [
      { to: '/products', label: 'Products & cards', icon: Boxes, permission: PERMISSIONS.products },
      { to: '/customers', label: 'Customers', icon: ContactRound, permission: PERMISSIONS.customers },
      { to: '/sales', label: 'Sales records', icon: ShoppingCart, permission: PERMISSIONS.sales },
      { to: '/qr-credits', label: 'QR credits', icon: QrCode, permission: PERMISSIONS.qrCredits },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: CreditCard,
    items: [
      { to: '/finance', label: 'Payment verification', icon: CreditCard, permission: PERMISSIONS.finance },
      { to: '/reports', label: 'Finance reports', icon: FileBarChart, permission: PERMISSIONS.reports },
    ],
  },
  {
    id: 'network',
    label: 'Network',
    icon: Network,
    items: [
      { to: '/vice-director', label: 'VD analytics', icon: BadgeDollarSign, permission: PERMISSIONS.genealogy },
      { to: '/genealogy/members', label: 'Genealogy', icon: Network, permission: PERMISSIONS.genealogy },
    ],
  },
  {
    id: 'governance',
    label: 'Governance',
    icon: ShieldCheck,
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell, permission: PERMISSIONS.dashboard },
      { to: '/activity', label: 'Activity', icon: Activity, permission: PERMISSIONS.audit },
      { to: '/audit', label: 'Audit log', icon: ShieldCheck, permission: PERMISSIONS.audit },
      { to: '/settings', label: 'Business rules', icon: Settings, permission: PERMISSIONS.settings },
    ],
  },
];

export function visibleNavigation(groups: NavigationGroup[], permissions: Set<string>, role: RoleSlug | null) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => permissions.has(item.permission) && (!item.superAdminOnly || role === 'super_admin')),
    }))
    .filter((group) => group.items.length > 0);
}
