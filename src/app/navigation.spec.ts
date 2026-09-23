import { describe, expect, it } from 'vitest';
import { navigation, visibleNavigation } from './navigation';
import { PERMISSIONS } from '../lib/permissions';

describe('sidebar visibility', () => {
  it('hides unauthorized groups and super-admin-only links', () => {
    const result = visibleNavigation(
      navigation,
      new Set([PERMISSIONS.dashboard, PERMISSIONS.sales, PERMISSIONS.customers]),
      'sales_manager',
    );
    expect(result.map((group) => group.id)).toEqual(['dashboard', 'sales', 'governance']);
    expect(result.find((group) => group.id === 'sales')?.items.map((item) => item.label)).toEqual(['Customers', 'Sales records']);
    expect(result.find((group) => group.id === 'governance')?.items.map((item) => item.label)).toEqual(['Notifications']);
  });

  it('keeps governance and organization links for the authorized role only', () => {
    const result = visibleNavigation(
      navigation,
      new Set(Object.values(PERMISSIONS)),
      'super_admin',
    );
    expect(result.find((group) => group.id === 'organization')?.items.some((item) => item.label === 'Users & roles')).toBe(true);
    expect(result.find((group) => group.id === 'governance')?.items.map((item) => item.label)).toContain('Audit log');
  });
});
