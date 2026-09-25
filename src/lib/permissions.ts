import type { RoleSlug } from './database.types';

export const PERMISSIONS = {
  dashboard: 'dashboard.view',
  analytics: 'analytics.view',
  users: 'users.manage',
  roles: 'roles.manage',
  departments: 'departments.manage',
  hr: 'hr.manage',
  products: 'products.manage',
  customers: 'customers.manage',
  identity: 'identity.manage',
  cardIssue: 'card_issue.manage',
  sales: 'sales.manage',
  finance: 'finance.manage',
  membershipActivation: 'membership.activate',
  reports: 'reports.view',
  genealogy: 'genealogy.view',
  genealogyManage: 'genealogy.manage',
  qrCredits: 'qr_credits.manage',
  ost: 'ost.manage',
  commissions: 'commissions.manage',
  redemptionProcess: 'redemption.process',
  redemptionManage: 'redemption.manage',
  cms: 'cms.manage',
  notifications: 'notifications.view',
  notificationsManage: 'notifications.manage',
  customerPortal: 'customer_portal.view',
  audit: 'audit.view',
  settings: 'settings.manage',
} as const;

export const roleHome: Record<RoleSlug, string> = {
  super_admin: '/', admin: '/', finance: '/finance', hr: '/employees',
  vice_director: '/vice-director', senior_sales_manager: '/genealogy/members',
  sales_manager: '/sales', employee: '/', ost: '/', customer: '/',
};
