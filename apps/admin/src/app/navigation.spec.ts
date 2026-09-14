import { describe, expect, it } from 'vitest';
import type { RoleRecord } from '@jad/contracts';

import {
  canAccess,
  canAccessModule,
  canAccessSubModule,
  filterDropdownForStaffRole,
  findNavItem,
  findNavSubItem,
  navItemsForRole,
  ADMIN_NAV_ITEMS,
} from './navigation';

describe('admin navigation registry', () => {
  it('returns no items for an unauthenticated session', () => {
    expect(navItemsForRole(null)).toEqual([]);
  });

  it('shows all admin sections to admin — single admin type', () => {
    const labels = navItemsForRole('admin').map((item) => item.label);
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Members');
    expect(labels).toContain('Operations');
    expect(labels).toContain('Properties');
    expect(labels).toContain('Marketing Tools');
    expect(labels).toContain('Broadcasts');
    expect(labels).toContain('System');
    expect(labels).toContain('Website CMS');
    expect(labels).not.toContain('Authentication');
  });

  it('restricts user to no admin access', () => {
    const labels = navItemsForRole('user').map((item) => item.label);
    expect(labels).toEqual([]);
  });

  it('enforces access per section for admin', () => {
    const registrationsItem = findNavItem('/admin/registrations');
    expect(registrationsItem).toBeDefined();
    if (registrationsItem) {
      expect(canAccess('admin', registrationsItem)).toBe(true);
    }
    const configItem = findNavItem('/admin/config');
    expect(configItem).toBeDefined();
    if (configItem) {
      expect(canAccess('admin', configItem)).toBe(true);
    }
    // user cannot access admin sections
    const memberItem = findNavItem('/admin/registrations');
    if (memberItem) {
      expect(canAccess('user', memberItem)).toBe(false);
    }
  });

  it('resolves unknown paths to undefined', () => {
    expect(findNavItem('/admin/nope')).toBeUndefined();
  });
});

describe('staff role module access', () => {
  it('grants every module to super_admin', () => {
    for (const item of ADMIN_NAV_ITEMS) {
      expect(canAccessModule('super_admin', undefined, item)).toBe(true);
    }
  });

  it('denies governance modules to admin', () => {
    const byTo = new Map(ADMIN_NAV_ITEMS.map((item) => [item.to, item]));
    expect(canAccessModule('admin', undefined, byTo.get('/admin')!)).toBe(true);
    expect(canAccessModule('admin', undefined, byTo.get('/admin/sales')!)).toBe(true);
    expect(canAccessModule('admin', undefined, byTo.get('/admin/config')!)).toBe(false);
  });

  it('denies null role id everything', () => {
    for (const item of ADMIN_NAV_ITEMS) {
      expect(canAccessModule(null, undefined, item)).toBe(false);
    }
  });

  it('resolves sub-item modules for breadcrumbs', () => {
    const found = findNavSubItem('/admin/withdrawals');
    expect(found?.sub.module).toBe('withdrawals');
    expect(canAccessSubModule('finance', undefined, found!.sub)).toBe(true);
    expect(canAccessSubModule('merchant', undefined, found!.sub)).toBe(false);
  });

  it('resolves custom role records over the matrix seed', () => {
    const roles: RoleRecord[] = [
      {
        id: 'role-finance-reviewer',
        name: 'Finance Reviewer',
        permissions: ['dashboard', 'sales', 'payouts', 'withdrawals'],
        isSystem: false,
      },
    ];
    const byTo = new Map(ADMIN_NAV_ITEMS.map((item) => [item.to, item]));
    expect(canAccessModule('role-finance-reviewer', roles, byTo.get('/admin/sales')!)).toBe(true);
    expect(canAccessModule('role-finance-reviewer', roles, byTo.get('/admin/members')!)).toBe(
      false,
    );
    expect(canAccessModule('role-ghost', roles, byTo.get('/admin/sales')!)).toBe(false);
    const items = navItemsForRole('admin', 'role-finance-reviewer', roles);
    expect(items.map((item) => item.label)).toEqual(['Dashboard', 'Operations']);
  });
});

describe('navItemsForRole with staff role', () => {
  it('keeps legacy output when staff role is omitted', () => {
    const labels = navItemsForRole('admin').map((item) => item.label);
    expect(labels).toContain('System');
    const system = navItemsForRole('admin').find((item) => item.label === 'System');
    expect(system?.dropdown?.length).toBe(4);
  });

  it('shows the full shell to super_admin', () => {
    const labels = navItemsForRole('admin', 'super_admin').map((item) => item.label);
    expect(labels).toEqual([
      'Dashboard',
      'Members',
      'Operations',
      'Properties',
      'Marketing Tools',
      'Broadcasts',
      'Messages',
      'Policies',
      'System',
      'Website CMS',
    ]);
  });

  it('hides config/audit from admin but keeps the System category empty-free', () => {
    const items = navItemsForRole('admin', 'admin');
    expect(items.some((item) => item.label === 'System')).toBe(false);
    expect(items.some((item) => item.label === 'Operations')).toBe(true);
  });

  it('shows Staff under System to super_admin only', () => {
    const superItems = navItemsForRole('admin', 'super_admin');
    const system = superItems.find((item) => item.label === 'System');
    const links = (system?.dropdown ?? []).filter((sub) => !('divider' in sub));
    expect(links.map((sub) => ('divider' in sub ? '' : sub.label))).toEqual([
      'System Configuration',
      'Audit Log',
      'Staff',
      'Roles',
    ]);
    expect(findNavSubItem('/admin/staff')?.sub.module).toBe('staff');
    expect(canAccessSubModule('admin', undefined, findNavSubItem('/admin/staff')!.sub)).toBe(false);
    expect(findNavSubItem('/admin/roles')?.sub.module).toBe('staff');
    expect(canAccessSubModule('finance', undefined, findNavSubItem('/admin/roles')!.sub)).toBe(
      false,
    );
  });

  it('limits finance to dashboard plus sales, payouts and withdrawals', () => {
    const items = navItemsForRole('admin', 'finance');
    expect(items.map((item) => item.label)).toEqual(['Dashboard', 'Operations']);
    const operations = items.find((item) => item.label === 'Operations');
    const links = (operations?.dropdown ?? []).filter((sub) => !('divider' in sub));
    expect(links.map((sub) => ('divider' in sub ? '' : sub.label))).toEqual([
      'Sales',
      'Payouts',
      'Withdrawals',
    ]);
  });

  it('keeps the Operations category for merchant with Vouchers only', () => {
    const items = navItemsForRole('admin', 'merchant');
    expect(items.map((item) => item.label)).toEqual(['Operations']);
    const operations = items.find((item) => item.label === 'Operations');
    const links = (operations?.dropdown ?? []).filter((sub) => !('divider' in sub));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ to: '/admin/vouchers', label: 'Vouchers' });
  });

  it('returns nothing for null staff role or null session role', () => {
    expect(navItemsForRole('admin', null)).toEqual([]);
    expect(navItemsForRole(null, 'super_admin')).toEqual([]);
  });
});

describe('filterDropdownForStaffRole', () => {
  it('strips orphaned dividers after filtering', () => {
    const operations = ADMIN_NAV_ITEMS.find((item) => item.label === 'Operations')!;
    const filtered = filterDropdownForStaffRole(operations.dropdown, 'merchant')!;
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ label: 'Vouchers' });
  });

  it('passes dropdowns through when staff role is null (legacy)', () => {
    const operations = ADMIN_NAV_ITEMS.find((item) => item.label === 'Operations')!;
    expect(filterDropdownForStaffRole(operations.dropdown, null)).toBe(operations.dropdown);
    expect(filterDropdownForStaffRole(undefined, 'admin')).toBeUndefined();
  });
});
