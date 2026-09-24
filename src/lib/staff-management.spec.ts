import { describe, expect, it } from 'vitest';
import { allowedParentRoles, canManageStaff, canViewGenealogy, isPlacementAllowed, permittedModules } from './staff-management';

describe('staff management rules', () => {
  it('allows permission-matrix staff managers', () => {
    expect(canManageStaff('super_admin')).toBe(true);
    expect(canManageStaff('admin')).toBe(true);
    expect(canManageStaff('hr')).toBe(false);
  });

  it('limits department users to their authorized modules', () => {
    expect([...permittedModules('finance')]).toEqual(['finance']);
    expect([...permittedModules('hr')]).toEqual(['hr']);
    expect(permittedModules('finance').has('hr')).toBe(false);
  });

  it('rejects invalid, self, and circular genealogy placement', () => {
    expect(isPlacementAllowed({ memberId: 'member', role: 'ost', parentId: 'manager', parentRole: 'sales_manager' })).toBe(true);
    expect(isPlacementAllowed({ memberId: 'member', role: 'ost', parentId: 'senior', parentRole: 'senior_sales_manager' })).toBe(false);
    expect(isPlacementAllowed({ memberId: 'member', role: 'sales_manager', parentId: 'member', parentRole: 'vice_director' })).toBe(false);
    expect(isPlacementAllowed({ memberId: 'member', role: 'sales_manager', parentId: 'child', parentRole: 'vice_director', descendantIds: new Set(['child']) })).toBe(false);
    expect([...allowedParentRoles('senior_sales_manager')]).toEqual(['vice_director']);
  });

  it('isolates Vice Directors to their own genealogy', () => {
    const viewer = { id: 'vd-a', role: 'vice_director' as const };
    expect(canViewGenealogy(viewer, { id: 'member-a', viceDirectorId: 'vd-a' })).toBe(true);
    expect(canViewGenealogy(viewer, { id: 'member-b', viceDirectorId: 'vd-b' })).toBe(false);
    expect(canViewGenealogy({ id: 'root', role: 'super_admin' }, { id: 'member-b', viceDirectorId: 'vd-b' })).toBe(true);
  });

  it('models deactivation as status change without deleting the profile identity', () => {
    const profile = { id: 'staff-1', employmentStatus: 'active', saleIds: ['sale-1'], auditIds: ['audit-1'] };
    const deactivated = { ...profile, employmentStatus: 'inactive' };
    expect(deactivated.id).toBe(profile.id);
    expect(deactivated.saleIds).toEqual(['sale-1']);
    expect(deactivated.auditIds).toEqual(['audit-1']);
  });
});
