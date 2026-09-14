import { describe, expect, it } from 'vitest';

import { pickStaffRoleId, staffRoleModules } from './rbac.js';

describe('pickStaffRoleId', () => {
  it('prefers super_admin, then admin, finance, merchant', () => {
    expect(pickStaffRoleId(['admin', 'super_admin'])).toBe('super_admin');
    expect(pickStaffRoleId(['finance', 'admin'])).toBe('admin');
    expect(pickStaffRoleId(['merchant', 'finance'])).toBe('finance');
  });

  it('returns the first custom (non-member) slug', () => {
    expect(pickStaffRoleId(['role-admin-support'])).toBe('role-admin-support');
  });

  it('returns null for member-only slugs and empties', () => {
    expect(pickStaffRoleId(['member_basic', 'user'])).toBeNull();
    expect(pickStaffRoleId([])).toBeNull();
  });
});

describe('staffRoleModules', () => {
  const svcFor = (rows: unknown[]) => ({
    from: (table: string) => {
      const b = {
        select: () => b,
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: table === 'Role' ? rows : [], error: null }),
      };
      return b;
    },
  });

  it('resolves a custom role by key with its stored modules', async () => {
    const svc = svcFor([
      {
        id: 'x-1',
        key: 'role-admin-support',
        slug: 'role-admin-support',
        name: 'Admin Support',
        permissions: ['dashboard', 'members'],
        is_system: false,
      },
    ]);
    await expect(staffRoleModules(svc, 'role-admin-support')).resolves.toEqual([
      'dashboard',
      'members',
    ]);
  });

  it('falls back to slug when the key is absent', async () => {
    const svc = svcFor([
      {
        id: 'x-2',
        key: null,
        slug: 'role-night-shift',
        name: 'Night Shift',
        permissions: ['dashboard'],
        is_system: false,
      },
    ]);
    await expect(staffRoleModules(svc, 'role-night-shift')).resolves.toEqual(['dashboard']);
  });

  it('falls back to the matrix for seed-empty system roles', async () => {
    const svc = svcFor([
      {
        id: 's-1',
        key: 'finance',
        slug: 'finance',
        name: 'Finance',
        permissions: [],
        is_system: true,
      },
    ]);
    await expect(staffRoleModules(svc, 'finance')).resolves.toEqual([
      'dashboard',
      'sales',
      'payouts',
      'withdrawals',
    ]);
  });

  it('denies unknown ids with an empty set', async () => {
    const svc = svcFor([]);
    await expect(staffRoleModules(svc, 'role-ghost')).resolves.toEqual([]);
  });
});
