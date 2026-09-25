import { describe, expect, it } from 'vitest';
import { breadcrumbItems, navigation, visibleNavigation } from './navigation';
import { PERMISSIONS } from '../lib/permissions';

describe('sidebar visibility', () => {
  it('hides unauthorized groups and super-admin-only links', () => {
    const result = visibleNavigation(
      navigation,
      new Set([PERMISSIONS.dashboard, PERMISSIONS.sales, PERMISSIONS.customers]),
      'sales_manager',
    );
    expect(result.map((group) => group.id)).toEqual(['dashboard', 'sales', 'network']);
    expect(result.find((group) => group.id === 'sales')?.items.map((item) => item.label)).toEqual(['Customers', 'Sales records']);
    expect(result.find((group) => group.id === 'network')?.items.map((item) => item.label)).toEqual(['OST referral codes', 'OST applications']);
  });

  it('does not expose placeholder or duplicate destinations', () => {
    const result = visibleNavigation(navigation, new Set(Object.values(PERMISSIONS)), 'super_admin');
    const paths = result.flatMap((group) => group.items.map((item) => item.to));
    expect(paths).not.toContain('/employees');
    expect(paths).not.toContain('/notifications');
    expect(paths).not.toContain('/activity');
  });

  it('does not expose OST administration to finance or HR', () => {
    for (const role of ['finance', 'hr'] as const) {
      const result = visibleNavigation(navigation, new Set(Object.values(PERMISSIONS)), role);
      expect(result.flatMap((group) => group.items).some((item) => item.to.startsWith('/ost/'))).toBe(false);
    }
  });

  it('keeps governance and organization links for the authorized role only', () => {
    const result = visibleNavigation(
      navigation,
      new Set(Object.values(PERMISSIONS)),
      'super_admin',
    );
    expect(result.find((group) => group.id === 'organization')?.items.some((item) => item.label === 'Users & accounts')).toBe(true);
    expect(result.find((group) => group.id === 'governance')?.items.map((item) => item.label)).toContain('Audit log');
  });

  it('builds central breadcrumbs for list and customer intake routes', () => {
    expect(breadcrumbItems('/finance', navigation).map((item) => item.label)).toEqual(['Dashboard','Finance','Payment & activation']);
    expect(breadcrumbItems('/customers/new', navigation)).toEqual([
      { label: 'Dashboard', to: '/' }, { label: 'Customers', to: '/customers' }, { label: 'Register customer' },
    ]);
  });
});
