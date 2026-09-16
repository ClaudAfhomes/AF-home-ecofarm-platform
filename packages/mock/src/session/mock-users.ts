import type { MockUser } from './types';

/** Default mock users for the development role switcher - Phase 1: admin/user only. */
export const MOCK_MEMBER: MockUser = {
  id: 'mem-001',
  name: 'Juan Dela Cruz',
  email: 'juan.delacruz@example.com',
  role: 'user',
  isQualified: true,
  status: 'APPROVED_ACTIVE',
};

export const MOCK_MEMBER_NOT_QUALIFIED: MockUser = {
  id: 'mem-002',
  name: 'Maria Santos',
  email: 'maria.santos@example.com',
  role: 'user',
  isQualified: false,
  status: 'APPROVED_ACTIVE',
};

export const MOCK_MEMBER_PENDING: MockUser = {
  id: 'mem-003',
  name: 'Pedro Pendiente',
  email: 'pedro.pendiente@example.com',
  role: 'user',
  isQualified: false,
  status: 'PENDING',
};

export const MOCK_MEMBER_REJECTED: MockUser = {
  id: 'mem-004',
  name: 'Ana Anay',
  email: 'ana.anay@example.com',
  role: 'user',
  isQualified: false,
  status: 'REJECTED',
};

export const MOCK_SUPER_ADMIN: MockUser = {
  id: 'sup-001',
  name: 'Saul Super',
  email: 'superadmin@gmail.com',
  role: 'admin',
  roleId: 'super_admin',
};

// Legacy aliases for tests that still import MOCK_ADMIN/MOCK_FINANCE - now single admin type
export const MOCK_ADMIN: MockUser = MOCK_SUPER_ADMIN;
export const MOCK_FINANCE: MockUser = {
  id: 'fin-001',
  name: 'Fina Finance',
  email: 'fina@jad.example',
  role: 'admin',
  roleId: 'finance',
};

/** Per-role staff principals for exercising RBAC shells (frontend pass). */
export const MOCK_STAFF_ADMIN: MockUser = {
  id: 'adm-001',
  name: 'Ada Admin',
  email: 'ada.admin@jad.example',
  role: 'admin',
  roleId: 'admin',
};

export const MOCK_STAFF_MERCHANT: MockUser = {
  id: 'mrc-001',
  name: 'Maya Merchant',
  email: 'maya.merchant@jad.example',
  role: 'admin',
  roleId: 'merchant',
};

export const MOCK_USERS: MockUser[] = [
  MOCK_MEMBER,
  MOCK_MEMBER_NOT_QUALIFIED,
  MOCK_MEMBER_PENDING,
  MOCK_MEMBER_REJECTED,
  MOCK_SUPER_ADMIN,
  MOCK_ADMIN,
  MOCK_FINANCE,
  MOCK_STAFF_ADMIN,
  MOCK_STAFF_MERCHANT,
];
