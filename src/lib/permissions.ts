import type { RoleSlug } from './database.types';

export const PERMISSIONS = {
  dashboard: 'dashboard.view',
  users: 'users.manage',
  roles: 'roles.manage',
  departments: 'departments.manage',
  hr: 'hr.manage',
  products: 'products.manage',
  customers: 'customers.manage',
  sales: 'sales.manage',
  finance: 'finance.manage',
  reports: 'reports.view',
  genealogy: 'genealogy.view',
  genealogyManage: 'genealogy.manage',
  qrCredits: 'qr_credits.manage',
  audit: 'audit.view',
  settings: 'settings.manage',
} as const;

export const roleHome: Record<RoleSlug, string> = {
  super_admin: '/', admin: '/', finance: '/finance', hr: '/employees',
  vice_director: '/vice-director', senior_sales_manager: '/genealogy',
  sales_manager: '/sales', ost: '/sales',
};
