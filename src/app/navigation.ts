import { Activity, BadgeDollarSign, Bell, Boxes, Building2, ContactRound, CreditCard, FileBarChart, GitBranch, LayoutDashboard, Network, PackageOpen, QrCode, Settings, ShieldCheck, ShoppingCart, UserCog, Users } from 'lucide-react';
import { PERMISSIONS } from '../lib/permissions';
export const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: PERMISSIONS.dashboard },
  { group: 'Settings' },
  { to: '/settings/users', label: 'Users & roles', icon: UserCog, permission: PERMISSIONS.users, superAdminOnly: true },
  { to: '/settings/departments', label: 'Departments', icon: Building2, permission: PERMISSIONS.departments, superAdminOnly: true },
  { group: 'Organization' },
  { to: '/employees', label: 'HR employees', icon: Users, permission: PERMISSIONS.hr },
  { group: 'Commerce' },
  { to: '/products', label: 'Products & cards', icon: Boxes, permission: PERMISSIONS.products },
  { to: '/customers', label: 'Customers', icon: ContactRound, permission: PERMISSIONS.customers },
  { to: '/sales', label: 'Sales records', icon: ShoppingCart, permission: PERMISSIONS.sales },
  { to: '/finance', label: 'Payment verification', icon: CreditCard, permission: PERMISSIONS.finance },
  { to: '/reports', label: 'Finance reports', icon: FileBarChart, permission: PERMISSIONS.reports },
  { group: 'Network' },
  { to: '/vice-director', label: 'VD analytics', icon: BadgeDollarSign, permission: PERMISSIONS.genealogy },
  { to: '/genealogy/members', label: 'Member management', icon: Network, permission: PERMISSIONS.genealogy },
  { to: '/qr-credits', label: 'QR credits', icon: QrCode, permission: PERMISSIONS.qrCredits },
  { group: 'Governance' },
  { to: '/notifications', label: 'Notifications', icon: Bell, permission: PERMISSIONS.dashboard },
  { to: '/activity', label: 'Activity', icon: Activity, permission: PERMISSIONS.audit },
  { to: '/audit', label: 'Audit log', icon: ShieldCheck, permission: PERMISSIONS.audit },
  { to: '/settings', label: 'Business rules', icon: Settings, permission: PERMISSIONS.settings },
] as const;
void PackageOpen; void GitBranch;
