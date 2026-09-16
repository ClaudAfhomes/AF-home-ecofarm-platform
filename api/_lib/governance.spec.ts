import { describe, expect, it } from 'vitest';

import {
  activeGovernorCount,
  guardRoleDeleteServer,
  guardRolePermissions,
  isLastGovernor,
  soleGrantedGovernance,
} from './governance.js';
import { pickStaffRoleId } from './rbac.js';

const ROLES = [
  { id: 'super_admin', permissions: ['staff', 'audit', 'config', 'sales'] },
  { id: 'admin', permissions: ['sales', 'members'] },
  { id: 'role-x', permissions: ['vouchers'] },
];

const MEMBERS = [
  { id: 'm-1', status: 'ACTIVE', roleId: 'super_admin' },
  { id: 'm-2', status: 'ACTIVE', roleId: 'admin' },
];

describe('soleGrantedGovernance', () => {
  it('finds modules only one role grants', () => {
    expect(soleGrantedGovernance(ROLES, 'super_admin').sort()).toEqual([
      'audit',
      'config',
      'staff',
    ]);
    expect(soleGrantedGovernance(ROLES, 'admin')).toEqual([]);
    expect(soleGrantedGovernance(ROLES, 'missing')).toEqual([]);
  });
});

describe('guardRolePermissions', () => {
  it('blocks self-stripping governance access', () => {
    const r = guardRolePermissions(ROLES, 'super_admin', ['sales'], 'super_admin');
    expect(r.ok).toBe(false);
  });

  it('blocks revoking the last grant of a governance module', () => {
    const r = guardRolePermissions(ROLES, 'super_admin', ['sales', 'audit', 'config'], 'admin');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('staff');
  });

  it('allows edits that keep shared modules', () => {
    // sales is also granted by admin → removing it from super_admin is safe.
    expect(
      guardRolePermissions(ROLES, 'super_admin', ['staff', 'audit', 'config'], 'admin').ok,
    ).toBe(true);
  });
});

describe('guardRoleDeleteServer', () => {
  it('requires super_admin session', () => {
    expect(
      guardRoleDeleteServer(
        ROLES,
        0,
        { id: 'role-x', permissions: ['vouchers'], isSystem: false },
        'admin',
      ).ok,
    ).toBe(false);
  });

  it('blocks deletion while members hold the role', () => {
    const r = guardRoleDeleteServer(
      ROLES,
      2,
      { id: 'role-x', permissions: ['vouchers'], isSystem: false },
      'super_admin',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('Reassign');
  });

  it('blocks deleting the last granter of a governance module', () => {
    const r = guardRoleDeleteServer(
      ROLES,
      0,
      { id: 'super_admin', permissions: ['staff', 'audit', 'config', 'sales'], isSystem: true },
      'super_admin',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('last role');
  });

  it('allows deleting an unheld non-governing custom role', () => {
    expect(
      guardRoleDeleteServer(
        ROLES,
        0,
        { id: 'role-x', permissions: ['vouchers'], isSystem: false },
        'super_admin',
      ).ok,
    ).toBe(true);
  });
});

describe('governor counting', () => {
  it('counts active governors excluding one id', () => {
    expect(activeGovernorCount(MEMBERS, ROLES)).toBe(1);
    expect(activeGovernorCount(MEMBERS, ROLES, 'm-1')).toBe(0);
    expect(isLastGovernor(MEMBERS, ROLES, MEMBERS[0]!)).toBe(true);
    expect(isLastGovernor(MEMBERS, ROLES, MEMBERS[1]!)).toBe(false);
  });
});

describe('pickStaffRoleId', () => {
  it('prioritizes super_admin > admin > finance > merchant, then custom', () => {
    expect(pickStaffRoleId(['member_basic', 'admin'])).toBe('admin');
    expect(pickStaffRoleId(['finance', 'admin'])).toBe('admin');
    expect(pickStaffRoleId(['merchant'])).toBe('merchant');
    expect(pickStaffRoleId(['role-finance-reviewer', 'member_basic'])).toBe(
      'role-finance-reviewer',
    );
    expect(pickStaffRoleId(['member_basic', 'user'])).toBeNull();
    expect(pickStaffRoleId([])).toBeNull();
  });
});
